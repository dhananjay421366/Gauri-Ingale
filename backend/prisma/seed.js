import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
const main = async () => {
  const password = await bcrypt.hash('password123', 10);
  const admin = await prisma.user.upsert({ where: { email: 'admin@infolab.dev' }, update: {}, create: { name: 'Aarav Mehta', email: 'admin@infolab.dev', password, role: 'ADMIN' } });
  await prisma.user.upsert({ where: { email: 'staff@infolab.dev' }, update: {}, create: { name: 'Nisha Rao', email: 'staff@infolab.dev', password, role: 'STAFF' } });
  await prisma.alert.deleteMany(); await prisma.statusLog.deleteMany(); await prisma.pC.deleteMany(); await prisma.lab.deleteMany();
  const labs = await Promise.all([
    prisma.lab.create({ data: { name: 'Innovation Lab', location: 'Block A · Floor 2', capacity: 40, description: 'Collaborative computing and prototyping space.' } }),
    prisma.lab.create({ data: { name: 'Digital Systems Lab', location: 'Block B · Floor 1', capacity: 32, description: 'Embedded systems and networking lab.' } })
  ]);
  const states = ['ONLINE','ONLINE','OFFLINE','ONLINE','MAINTENANCE','ONLINE','OFFLINE','ONLINE','ONLINE','MAINTENANCE','ONLINE','OFFLINE'];
  for (let i = 0; i < states.length; i++) { const lab = labs[i < 6 ? 0 : 1]; const pc = await prisma.pC.create({ data: { name: `INF-${String(i + 1).padStart(2,'0')}`, ipAddress: `10.0.${lab === labs[0] ? 10 : 20}.${i + 11}`, macAddress: `A4:7B:9C:2D:${String(i).padStart(2,'0')}:F${i}`, status: states[i], lastSeen: states[i] === 'OFFLINE' ? new Date(Date.now() - 1000 * 60 * (55 + i * 8)) : new Date(), manufacturer: i % 2 ? 'Lenovo' : 'Dell', model: i % 2 ? 'ThinkCentre M90q' : 'OptiPlex 7010', notes: i === 4 ? 'Scheduled RAM replacement' : 'Standard lab workstation', password: 'managed-by-admin', labId: lab.id } }); if (states[i] !== 'OFFLINE') await prisma.statusLog.create({ data: { pcId: pc.id, oldStatus: 'OFFLINE', newStatus: states[i], changedBy: admin.id } }); }
  await prisma.setting.createMany({ data: [{ key: 'offlineMinutes', value: '30' }, { key: 'temperatureThreshold', value: '75' }, { key: 'maintenanceReminderDays', value: '7' } ], skipDuplicates: true });
}; main().finally(() => prisma.$disconnect());
