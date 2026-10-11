import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendAlertEmail } from "./mailer.js";

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL || "http://localhost:5173" },
});
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());
app.use(morgan("dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
const secret = process.env.JWT_SECRET || "dev-secret";
const refreshSecret = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret";
const sign = (user) => ({
    accessToken: jwt.sign(
        { id: user.id, role: user.role, email: user.email },
        secret,
        { expiresIn: "15m" },
    ),
    refreshToken: jwt.sign({ id: user.id }, refreshSecret, { expiresIn: "7d" }),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
});
const auth = (req, res, next) => {
    try {
        req.user = jwt.verify(
            (req.headers.authorization || "").replace("Bearer ", ""),
            secret,
        );
        next();
    } catch {
        res.status(401).json({ message: "Authentication required" });
    }
};
const admin = (req, res, next) =>
    req.user.role === "ADMIN"
        ? next()
        : res.status(403).json({ message: "Admin access required" });
const asyncRoute = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
const pcInput = z.object({
    name: z.string().min(2),
    ipAddress: z.string().min(3),
    macAddress: z.string().min(3),
    labId: z.string(),
    status: z.enum(["ONLINE", "OFFLINE", "MAINTENANCE"]).optional(),
    notes: z.string().optional().nullable(),
    password: z.string().optional().nullable(),
    manufacturer: z.string().optional().nullable(),
    model: z.string().optional().nullable(),
});
const publishAlert = async (alert) => {
    io.emit("alert:new", alert);
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
    await sendAlertEmail(alert, admins.map((user) => user.email));
};

app.get("/api/health", (_, res) => res.json({ status: "ok" }));
app.post(
    "/api/auth/login",
    asyncRoute(async (req, res) => {
        const body = z
            .object({ email: z.string().email(), password: z.string().min(6) })
            .parse(req.body);
        const user = await prisma.user.findUnique({
            where: { email: body.email },
        });
        if (!user || !(await bcrypt.compare(body.password, user.password)))
            return res
                .status(401)
                .json({ message: "Invalid email or password" });
        res.json(sign(user));
    }),
);
app.post(
    "/api/auth/signup",
    asyncRoute(async (req, res) => {
        const body = z.object({
            name: z.string().trim().min(2).max(100),
            email: z.string().trim().toLowerCase().email(),
            password: z.string().min(6).max(128),
        }).parse(req.body);
        const existing = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
        if (existing) return res.status(409).json({ message: "An account with this email already exists" });
        const user = await prisma.user.create({
            data: { name: body.name, email: body.email, password: await bcrypt.hash(body.password, 10), role: "STAFF" },
        });
        res.status(201).json(sign(user));
    }),
);
app.post("/api/auth/refresh", (req, res) => {
    try {
        const p = jwt.verify(req.body.refreshToken, refreshSecret);
        prisma.user
            .findUnique({ where: { id: p.id } })
            .then((u) =>
                u
                    ? res.json(sign(u))
                    : res
                          .status(401)
                          .json({ message: "Invalid refresh token" }),
            );
    } catch {
        res.status(401).json({ message: "Invalid refresh token" });
    }
});

app.get(
    "/api/dashboard",
    auth,
    asyncRoute(async (_, res) => {
        const [labs, pcs, alerts] = await Promise.all([
            prisma.lab.findMany({ include: { pcs: true } }),
            prisma.pC.findMany({
                include: { lab: { select: { name: true } } },
                orderBy: { name: "asc" },
            }),
            prisma.alert.findMany({
                where: { isRead: false },
                include: { pc: { select: { name: true } } },
                orderBy: { createdAt: "desc" },
                take: 20,
            }),
        ]);
        res.json({
            labs,
            pcs,
            alerts,
            summary: {
                labs: labs.length,
                pcs: pcs.length,
                online: pcs.filter((p) => p.status === "ONLINE").length,
                offline: pcs.filter((p) => p.status === "OFFLINE").length,
                maintenance: pcs.filter((p) => p.status === "MAINTENANCE")
                    .length,
            },
        });
    }),
);
app.get(
    "/api/labs",
    auth,
    asyncRoute(async (_, res) =>
        res.json(
            await prisma.lab.findMany({
                include: { pcs: true },
                orderBy: { name: "asc" },
            }),
        ),
    ),
);
app.post(
    "/api/labs",
    auth,
    admin,
    asyncRoute(async (req, res) =>
        res
            .status(201)
            .json(
                await prisma.lab.create({
                    data: z
                        .object({
                            name: z.string(),
                            location: z.string(),
                            capacity: z.coerce.number().int().positive(),
                            description: z.string().optional(),
                        })
                        .parse(req.body),
                }),
            ),
    ),
);
app.put(
    "/api/labs/:id",
    auth,
    admin,
    asyncRoute(async (req, res) =>
        res.json(
            await prisma.lab.update({
                where: { id: req.params.id },
                data: req.body,
            }),
        ),
    ),
);
app.delete(
    "/api/labs/:id",
    auth,
    admin,
    asyncRoute(async (req, res) => {
        await prisma.lab.delete({ where: { id: req.params.id } });
        res.status(204).end();
    }),
);
app.get(
    "/api/pcs/:id",
    auth,
    asyncRoute(async (req, res) =>
        res.json(
            await prisma.pC.findUniqueOrThrow({
                where: { id: req.params.id },
                include: {
                    lab: true,
                    statusLogs: {
                        include: { user: { select: { name: true } } },
                        orderBy: { createdAt: "desc" },
                        take: 30,
                    },
                    alerts: { orderBy: { createdAt: "desc" }, take: 10 },
                },
            }),
        ),
    ),
);
app.post(
    "/api/pcs",
    auth,
    admin,
    asyncRoute(async (req, res) =>
        res
            .status(201)
            .json(await prisma.pC.create({ data: pcInput.parse(req.body) })),
    ),
);
app.put(
    "/api/pcs/:id",
    auth,
    asyncRoute(async (req, res) => {
        const old = await prisma.pC.findUniqueOrThrow({
            where: { id: req.params.id },
        });
        const data = pcInput.partial().parse(req.body);
        const pc = await prisma.pC.update({
            where: { id: req.params.id },
            data: {
                ...data,
                lastSeen: data.status === "ONLINE" ? new Date() : undefined,
            },
        });
        if (data.status && data.status !== old.status) {
            await prisma.statusLog.create({
                data: {
                    pcId: pc.id,
                    oldStatus: old.status,
                    newStatus: data.status,
                    changedBy: req.user.id,
                },
            });
            io.emit("pc:status", pc);
            if (data.status === "OFFLINE") {
                const a = await prisma.alert.create({
                    data: {
                        type: "PC_OFFLINE",
                        message: `${pc.name} is now offline`,
                        severity: "WARNING",
                        pcId: pc.id,
                    },
                });
                await publishAlert(a);
            }
        }
        res.json(pc);
    }),
);
app.delete(
    "/api/pcs/:id",
    auth,
    admin,
    asyncRoute(async (req, res) => {
        await prisma.pC.delete({ where: { id: req.params.id } });
        res.status(204).end();
    }),
);
app.get(
    "/api/users",
    auth,
    admin,
    asyncRoute(async (_, res) =>
        res.json(
            await prisma.user.findMany({
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    createdAt: true,
                },
                orderBy: { createdAt: "desc" },
            }),
        ),
    ),
);
app.post(
    "/api/users",
    auth,
    admin,
    asyncRoute(async (req, res) => {
        const b = z
            .object({
                name: z.string().min(2),
                email: z.string().email(),
                password: z.string().min(6),
                role: z.enum(["ADMIN", "STAFF"]),
            })
            .parse(req.body);
        const user = await prisma.user.create({
            data: { ...b, password: await bcrypt.hash(b.password, 10) },
        });
        res.status(201).json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
        });
    }),
);
app.get(
    "/api/settings",
    auth,
    admin,
    asyncRoute(async (_, res) => res.json(await prisma.setting.findMany())),
);
app.put(
    "/api/settings",
    auth,
    admin,
    asyncRoute(async (req, res) => {
        await Promise.all(
            Object.entries(req.body).map(([key, value]) =>
                prisma.setting.upsert({
                    where: { key },
                    update: { value: String(value) },
                    create: { key, value: String(value) },
                }),
            ),
        );
        res.json(await prisma.setting.findMany());
    }),
);
app.patch(
    "/api/alerts/:id/read",
    auth,
    asyncRoute(async (req, res) =>
        res.json(
            await prisma.alert.update({
                where: { id: req.params.id },
                data: { isRead: true },
            }),
        ),
    ),
);
app.post("/api/test/generate-alert", auth, admin, asyncRoute(async (_, res) => {
    const pc = await prisma.pC.findFirst({ orderBy: { name: "asc" } });
    if (!pc) return res.status(404).json({ message: "Create or seed a PC first" });
    const alert = await prisma.alert.create({ data: {
        type: "TEMPERATURE_HIGH",
        message: `${pc.name} test temperature reached 82°C`,
        severity: "WARNING",
        pcId: pc.id,
    } });
    await publishAlert(alert);
    res.status(201).json(alert);
}));
app.post("/api/test/toggle-pc", auth, admin, asyncRoute(async (req, res) => {
    const pc = await prisma.pC.findFirst({ orderBy: { name: "asc" } });
    if (!pc) return res.status(404).json({ message: "Create or seed a PC first" });
    const nextStatus = pc.status === "ONLINE" ? "OFFLINE" : "ONLINE";
    const updated = await prisma.pC.update({ where: { id: pc.id }, data: { status: nextStatus, lastSeen: nextStatus === "ONLINE" ? new Date() : pc.lastSeen } });
    await prisma.statusLog.create({ data: { pcId: pc.id, oldStatus: pc.status, newStatus: nextStatus, changedBy: req.user.id } });
    io.emit("pc:status", updated);
    if (nextStatus === "OFFLINE") {
        const alert = await prisma.alert.create({ data: { type: "PC_OFFLINE", message: `${pc.name} test status changed to offline`, severity: "WARNING", pcId: pc.id } });
        await publishAlert(alert);
    }
    res.json(updated);
}));
app.use((err, _, res, __) => {
    console.error(err);
    res.status(err.name === "ZodError" ? 400 : 500).json({
        message:
            err.name === "ZodError"
                ? "Please check the submitted fields"
                : "Server error",
    });
});
io.on("connection", (socket) =>
    socket.emit("connected", { message: "Live monitoring connected" }),
);
setInterval(async () => {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const pcs = await prisma.pC.findMany({
        where: { status: "OFFLINE", lastSeen: { lt: cutoff } },
    });
    for (const pc of pcs) {
        const exists = await prisma.alert.findFirst({
            where: { pcId: pc.id, type: "PC_OFFLINE", isRead: false },
        });
        if (!exists) {
            const alert = await prisma.alert.create({
                data: {
                    type: "PC_OFFLINE",
                    message: `${pc.name} has been offline for over 30 minutes`,
                    severity: "CRITICAL",
                    pcId: pc.id,
                },
            });
            await publishAlert(alert);
        }
    }
}, 60000);
const port = Number(process.env.PORT || 4000);
httpServer.listen(port, () => console.log(`INFOLAB API listening on ${port}`));
