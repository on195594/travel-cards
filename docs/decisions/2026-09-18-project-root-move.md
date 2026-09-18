# Travel Cards project-root move

- **Date:** 2026-09-18
- **Decision:** Move the active development checkout from `/home/lin/.hermes/projects/travel-cards` to `/home/lin/travel-cards`.
- **Scope:** Move the complete Git working tree, including local ignored development configuration; keep `/home/lin/.config/travel-cards` in place because it is runtime configuration, not the project checkout.
- **Compatibility:** Do not leave a symlink at the old path. Historical review records keep their original paths as execution evidence.
