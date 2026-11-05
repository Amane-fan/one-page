import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// 不在检测规则中写入任何真实个人信息。只允许通用初始化模板进入源码。
const template = JSON.parse(readFileSync('src/data/resume.json','utf8'));
const expected = {name:'你的姓名',school:'示例大学｜计算机科学与技术｜本科｜20XX.09 - 20XX.06',email:'hello@example.com',phone:'',github:'https://github.com/example',photo:''};
for(const [key,value] of Object.entries(expected)) {
  if(template.profile[key]!==value) throw new Error(`初始化模板含非匿名字段：${key}`);
}
const paths=execFileSync('git',['-c',`safe.directory=${process.cwd()}`,'ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const prohibited=paths.filter(p=>/\.(pdf|png|jpe?g|webp|log|zip)$/i.test(p)||/(^|\/)(artifacts|private|local-data|test-results)\//.test(p)||(/\.html$/i.test(p)&&p!=='index.html')||/(^|\/)\.env($|\.)/.test(p));
if(prohibited.length) throw new Error(`发现不应提交的本地文件：${prohibited.join(', ')}`);
for(const path of paths.filter(p=>/\.(tsx?|m?js|json|md|html|css)$/.test(p)&&p!=='package-lock.json')) {
  let content;try{content=readFileSync(path,'utf8');}catch{continue;}
  if(/(?<!\d)1[3-9]\d{9}(?!\d)/.test(content)) throw new Error(`疑似私人手机号：${path}`);
  if(/(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{32,})/.test(content)) throw new Error(`疑似访问密钥：${path}`);
}
console.log('隐私检查通过：匿名模板，无个人附件、手机号或密钥。');
