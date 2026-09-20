# Releasing

How a version of arcflow reaches npm and how the docs site reaches GitHub Pages. The packages share one version and go out together. Everything below was checked against the 0.1.0 tree on 2026-09-20; the two things that cannot be done from this repository — an npm token and turning Pages on — are marked **once**.

## Before the first release (once)

1. **Own the `@arcflow` scope on npm.** Sign in at npmjs.com and create an organisation named `arcflow` (Organisations → Create). A scope belongs to the user or organisation of the same name, so if `arcflow` is already taken the packages have to be renamed before anything is tagged — search `@arcflow` on npm first. As of 2026-09-20 no package is published under the scope.
2. **Make a publish token.** Access Tokens → Generate → *Granular access token*: read and write, restricted to packages and scopes `@arcflow`, and *Bypass two-factor authentication* on, because CI publishes without a person present. Copy it once.
3. **Put it in the repository.** GitHub → arcsig-labs/arcflow → Settings → Secrets and variables → Actions → *New repository secret*: name `NPM_TOKEN`. Only the canonical repository needs it; the release workflow skips the personal mirror.
4. **Turn Pages on.** Settings → Pages → *Build and deployment* → Source: **GitHub Actions**. The Docs workflow tries to do this itself, but the default token is not allowed to administer the repository, which is why every run so far has failed at `configure-pages`. If the option is missing, the organisation is blocking it: arcsig-labs → Settings → Member privileges → *Pages creation* must allow public sites. Once it is on, re-run the Docs workflow (Actions → Docs → Run workflow) or push to `main`; the site appears at `https://arcsig-labs.github.io/arcflow/`.
5. **Fill in the repository's About box** on GitHub: description from the root `package.json`, website = the Pages URL, topics `workflow`, `automation`, `n8n`, `svelte`, `mcp`, `llm`. It is empty today.

## Every release

1. **Green tree.** On `main`, with nothing uncommitted:

   ```sh
   pnpm install --frozen-lockfile
   pnpm test && pnpm build && pnpm -r check
   ```

2. **Pack and try the tarballs** the way a user would receive them. `pnpm pack` rewrites `workspace:*` and applies `publishConfig`, and copies the root `LICENSE` into each package.

   ```sh
   packs=$(mktemp -d)
   for dir in packages/*/; do (cd "$dir" && pnpm pack --pack-destination "$packs"); done
   tar -tzf "$packs"/arcflow-editor-0.1.0.tgz | grep 'dist/svelte/index.d.ts'   # types shipped
   mkdir /tmp/arcflow-smoke && cd /tmp/arcflow-smoke && npm init -y
   npm install "$packs"/*.tgz
   printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' | ./node_modules/.bin/arcflow-mcp
   ARCFLOW_SECRET=smoke-secret-0123456789 ./node_modules/.bin/arcflow dev --port 8799 &
   curl -s http://127.0.0.1:8799/api/steps | head -c 200
   ```

   Installing all tarballs in one `npm install` lets npm satisfy the `@arcflow/*` dependencies from each other instead of the registry, which matters before the first publish.

3. **Say what the version is.** In one commit:
   - `CHANGELOG.md`: change `## 0.1.0 — unreleased` to `## 0.1.0 — 2026-MM-DD` and reread the entries against what actually shipped.
   - `PRODUCT.md`, *Undecided or not yet true*: remove the lines about being unreleased and about Pages, and update the measured counts if they moved.
   - `apps/docs/src/routes/+page.svelte`, the status panel: replace "0.1.0, unreleased" and the sentence about nothing being on npm with the install command and the release date. `DESIGN.md` describes that panel; keep it truthful there too.
   - Root `README.md`: the *Roadmap* section should describe what comes after this version.
   - If the version number changes, change it in every `packages/*/package.json` and in `@arcflow/server`'s peer ranges.

4. **Tag.** The tag is the trigger; the push goes to both remotes and only the canonical repository publishes.

   ```sh
   git tag v0.1.0
   git push origin main v0.1.0
   ```

   The Release workflow runs tests, builds, packs every non-private package and publishes each tarball with `npm publish --provenance --access public`. Provenance links the package to this repository and the exact commit, which is why `repository.url` in every `package.json` must stay `arcsig-labs/arcflow`.

5. **Confirm from the outside.**

   ```sh
   npm view @arcflow/core version
   npx -y @arcflow/mcp --help
   npx -y @arcflow/server --help
   ```

   Then create a GitHub Release for the tag (Releases → Draft a new release) and paste the changelog section in as the notes.

6. **Start the next version.** Bump `version` in the packages to the next `0.x.0`, add `## 0.x.0 — unreleased` to the changelog, and commit.

## If a publish fails halfway

npm refuses to publish the same version twice, so a rerun of the workflow republishes only what is missing and fails on what already exists. Publish the remaining tarballs by hand from the packed directory with the same command the workflow uses, or bump to a patch version and tag again. Never delete a published version to retry: npm blocks the version number for 24 hours after an unpublish.

## Later: trusted publishing

Once every package exists on npm, each one can be configured on npmjs.com (package → Settings → *Trusted publisher*: this repository and the `release.yml` workflow), after which `NPM_TOKEN` can be removed and the workflow authenticates with the job's OIDC token alone. The first publish of a new package still needs the token.
