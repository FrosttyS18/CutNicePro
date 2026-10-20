import io
p = r'C:\CutNicePro\experiments\clip-selection-ab\src\main.rs'
s = io.open(p, encoding='utf-8').read()
# apenas inserir antes de rerank_full_cmd se não existe
if 'fn discover_cmd' not in s:
    func = io.open(r'C:\CutNicePro\experiments\clip-selection-ab\tools\discover_body.txt', encoding='utf-8').read()
    marker = '\nfn rerank_full_cmd() {'
    s = s.replace(marker, '\n' + func + marker, 1)
    s = s.replace('Some("flow") => flow_cmd(&args),', 'Some("flow") => flow_cmd(&args),\n        Some("discover") => discover_cmd(&args),')
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('inserido')
else:
    print('já existe')
