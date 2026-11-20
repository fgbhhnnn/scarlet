const ts = require('typescript'), fs=require('fs'), cp=require('child_process');
const paths=process.argv.slice(2);
const attrs=/^(aria-label|aria-description|aria-valuetext|alt|placeholder|label|title|hint|body|confirmLabel|valueLabel|playLabel|description|empty)$/;
for(const path of paths) {
 const f=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
 const out=[];
 function walk(n) {
   const p=n.parent;
   if (ts.isJsxText(n)) { const s=n.text.trim();if(/[a-z]{2,}/i.test(s))out.push([f.getLineAndCharacterOfPosition(n.getStart(f)).line+1,s]); }
   if(ts.isStringLiteralLike(n)||ts.isTemplateExpression(n)) {
     const s=ts.isStringLiteralLike(n)? n.text:n.getText(f).slice(1,-1);
     if (/(?:[a-z]{2,} [a-z]{2,}|^[A-Z][a-z]{2,}(?:[.?…])?$|…)/.test(s) && !/[\u4e00-\u9fff]/.test(s) && !ts.isImportDeclaration(p) && !ts.isImportTypeNode(p) && !ts.isLiteralTypeNode(p) && !s.includes('\\n') && !s.startsWith('/')) {
       const a = ts.findAncestor(n,x=>ts.isJsxAttribute(x));
       if ((!a || attrs.test(a.name.getText(f))) && (!a || !n.getText(f).includes('className')) && !/[\w][-/][a-z-]+/.test(s.replace(/\${[^}]+}/g,''))) out.push([f.getLineAndCharacterOfPosition(n.getStart(f)).line+1,s]);
     }
   }
   ts.forEachChild(n,walk);
 } walk(f);
 if(out.length) console.log(path+'\n'+out.map(([line,s])=>line+'\t'+s.replaceAll('\n',' ')).join('\n'));
}
