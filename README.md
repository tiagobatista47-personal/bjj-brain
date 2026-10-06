# BJJ Brain V0.2

PWA local-first para uso pessoal. Todos os dados ficam no IndexedDB do aparelho.

## Novidades da V0.2

- Posição, situação e objetivos por memória
- Estágios: Descoberta → Estudando → Drillando → Testando → Funcional → Incorporado
- Progressão manual de estágio
- Histórico de observações por memória
- Aba Quero Aprender
- Aba Estudos
- Vínculo de memórias com Estudos
- Aba Meu Jogo com resumo por estágio
- Backup V0.2 com memórias, estudos, observações e Quero Aprender
- Importação compatível com backups V0.1

## Atualizar no GitHub Pages

Substitua no repositório os arquivos:

- index.html
- app.js
- styles.css
- manifest.json
- service-worker.js
- README.md

Mantenha os ícones ou substitua pelos incluídos neste pacote.

Depois faça o commit na branch `main`. O GitHub Pages deve publicar a nova versão automaticamente.

### Importante no iPhone

A V0.2 usa o mesmo banco `bjj-brain-db`, agora na versão 2. As memórias da V0.1 devem permanecer após a atualização.

Antes de atualizar, faça um **Exportar backup** na V0.1 como precaução.

Se o ícone instalado continuar mostrando a versão antiga após o deploy:
1. abra o site no Safari e atualize a página;
2. feche o BJJ Brain completamente e abra novamente;
3. se necessário, aguarde alguns segundos para o Service Worker atualizar e repita.

Não limpe os dados do Safari/site, pois isso pode apagar o IndexedDB local.
