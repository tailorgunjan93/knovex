## Summary

<!-- What does this PR do? One or two sentences. -->

Closes #<!-- issue number -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no functionality change)
- [ ] Documentation
- [ ] Tests

## Changes made

<!-- List the specific changes. Be precise. -->

-
-
-

## Testing

<!-- How did you test this? -->

- [ ] Backend: `pytest tests/ -v` passes
- [ ] Frontend: `cd frontend && npm run build && npm test` passes
- [ ] Desktop (if touched): `cd desktop && node --test` passes
- [ ] E2E (if a user-facing flow changed): `npx playwright test --config playwright.config.realbackend.ts`
- [ ] If a bug was fixed / feature added: a test reproduces it

## Checklist

- [ ] `ruff check backend tests` passes
- [ ] `cd frontend && npx tsc --noEmit` passes
- [ ] New functions have docstrings / types
- [ ] `CHANGELOG.md` updated
- [ ] If releasing: ALL version files bumped together (see `CLAUDE.md` → Version Files)
- [ ] Followed the test-first release process for anything packaged
