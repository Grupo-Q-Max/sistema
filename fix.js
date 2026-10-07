const fs = require('fs');
let s = fs.readFileSync('prisma/schema.prisma', 'utf8');
if(s.includes('\0')) {
  s = fs.readFileSync('prisma/schema.prisma', 'utf16le');
}
s = s.replace(/^\uFEFF/, '');
const match = s.match(/model InstallmentSetting\s*\{[\s\S]*?\n\}/);
if (match) {
  s = s.substring(0, match.index + match[0].length);
}
s += '\n\nmodel SystemLog {\n  id String @id @default(uuid())\n  userId String?\n  userEmail String?\n  userName String?\n  action String\n  entity String?\n  entityId String?\n  details Json?\n  ipAddress String?\n  createdAt DateTime @default(now())\n}\n';
fs.writeFileSync('prisma/schema.prisma', s, 'utf8');
