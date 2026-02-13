# Render troubleshooting (frontend `quanton3d-site`)

## Diagnóstico do erro atual
O log de deploy informado é do serviço/repositório **`quanton3d-site`** e falha no build do Vite com erro de sintaxe em:

- `src/components/AdminPanel.jsx:43:10`
- `Expected "}" but found "response"`

Isso indica erro de sintaxe JavaScript/JSX no frontend (não no backend `quanton3d-bot`).

## Checklist objetivo para resolver
1. Abra `src/components/AdminPanel.jsx` no commit que o Render está buildando (`52c43b9...`).
2. Revise o bloco imediatamente acima da linha 43 (normalmente `try { ... }`, `if (...) { ... }` ou objeto literal).
3. Garanta fechamento correto de `}` e `)` antes da linha:

```js
let response = await fetchVisualKnowledge(`${ADMIN_BASE_URL}/api/visual-knowledge`)
```

4. Rode localmente no repositório frontend:

```bash
pnpm install --no-frozen-lockfile
pnpm run build
```

5. Só então faça novo deploy no Render.

## Importante
As diretrizes Jan/2026 continuam válidas neste backend:

- `/resins` usa MongoDB coleção `parametros`.
- Evitar fallback para JSON local de resinas.
- Build em Render com `CI=true` e `pnpm install --no-frozen-lockfile`.
