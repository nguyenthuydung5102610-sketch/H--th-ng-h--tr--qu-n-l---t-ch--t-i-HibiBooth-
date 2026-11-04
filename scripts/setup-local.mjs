import { existsSync,readFileSync,writeFileSync } from 'node:fs';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const example=join(root,'server','.env.example'),target=join(root,'server','.env');
if(existsSync(target)) {console.log('server/.env đã tồn tại; giữ nguyên file để bảo vệ cấu hình đang dùng.');process.exit(0);}
if(!existsSync(example)) {console.error('Không tìm thấy server/.env.example');process.exit(1);}
const secret=randomBytes(48).toString('hex');
const content=readFileSync(example,'utf8').replace(/^JWT_SECRET=.*$/m,`JWT_SECRET=${secret}`);
writeFileSync(target,content,{flag:'wx',mode:0o600});
console.log('Đã tạo server/.env với JWT_SECRET ngẫu nhiên cho môi trường local. KHÔNG đưa file .env lên Git.');
