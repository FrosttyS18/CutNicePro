# CutNicePro — Product Brief

> Documento de visão. Nenhuma funcionalidade foi implementada; a stack de produção ainda não foi definida.

## Visão

Plataforma de edição e processamento automático de vídeos, com recursos semelhantes aos do OpusClip, preparada para evoluir futuramente em um produto comercial. Preferência inicial por ferramentas open-source e processamento local sempre que tecnicamente adequado.

## Objetivos funcionais conhecidos

- Importação de vídeos longos, curtos e arquivos previamente editados.
- Identificação automática dos melhores momentos usando IA.
- Geração de múltiplos cortes a partir de um vídeo.
- Legendas automáticas sincronizadas, incluindo animação por palavra.
- Reenquadramento inteligente para formatos 9:16, 1:1 e 16:9.
- Identificação de rostos e acompanhamento de participantes.
- Efeitos, transições, zoom, templates e tratamento de áudio.
- Normalização técnica de vídeos, limpeza de metadados desnecessários e exportação padronizada — sem presumir que isso burle sistemas de reconhecimento ou garanta originalidade.
- Processamento de múltiplos vídeos em lote.
- Interface profissional com prévia, timeline, configurações, histórico e exportação.

## Restrições e contexto

- O GLM-5.3 e GLM-5.3-Flash estão disponíveis pelo Coding Plan **apenas para auxiliar o desenvolvimento**; a assinatura não deve ser tratada como API de produção da aplicação.
- Decisões de arquitetura (motor de vídeo, backend, frontend) serão tomadas nas etapas de SPEC/PLAN com o usuário.
