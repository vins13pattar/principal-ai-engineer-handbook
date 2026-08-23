### 1. The ground moved under a settled decision

**Host:** So we've got ADR-0007, and the setup here is a little unusual because this isn't a story about a bad decision getting fixed. ADR-0005 picked Cloudflare Pages via git integration, and by every account that was the right call at the time. So what actually forced a new ADR?

**Guest:** The platform moved out from under it. ADR-0005 was written against a specific flow — Workers and Pages, Create, Pages, Connect to Git — with build settings tuned for that: build command, output directory, root directory. But if you go create a new git-connected project on Cloudflare today, you don't land in that flow anymore, you land in Workers Builds. That setup form doesn't even ask for an output directory, it asks for a deploy command, and critically, it deploys a Worker, not a Pages project. Same goal, totally different artifact underneath.

### 2. Three silent breakages

**Host:** Okay, so say you just point the same repo at Workers Builds and don't touch anything else. Walk me through what actually breaks.

**Guest:** Three things, and none of them throw an obvious error at you. First, wrangler deploy just refuses outright, because the config still has pages\_build\_output\_dir in it, which marks the project as Pages, and the Workers deploy command isn't valid against that. Second, even if you strip that out, bare wrangler deploy at the root of a pnpm workspace flat out declines to run — it says application detection has been run at the root of a workspace instead of targeting a specific project, because it won't guess which package you mean, and that's a monorepo-specific failure you won't find in a single-package tutorial.

**Host:** And the third one — that's the one that doesn't even fail, right? It just quietly does the wrong thing.

**Guest:** Exactly, and it's the worst of the three. CF\_PAGES\_URL simply doesn't exist on Workers Builds, it's a Pages-only variable, but the site config was reading it to derive the canonical site URL. So on Workers it silently falls through to the hard-coded fallback, the build goes green, the site renders fine to a human — and every one of the fifty pages plus every entry in sitemap-0.xml gets stamped with the wrong canonical URL.

### 3. Weighing the way out: legacy flow, split repo, or static-assets Worker

**Host:** So you're staring at this with three failure modes on the table. What were the actual options for getting out of it?

**Guest:** Three paths. First, hunt down the legacy Pages project creation flow and just stay put — it still exists for now, but Cloudflare is visibly steering people away from it, and it doesn't actually solve the monorepo detection problem or the canonical URL problem, it just avoids confronting them. Second, pull the site out of the pnpm workspace into its own repository so wrangler's auto-detection has a single package to find, no ambiguity.

**Host:** That second one sounds tempting on the surface — trade a messy detection problem for a clean repo boundary. What's the catch?

**Guest:** The catch is that it undoes the exact thing ADR-0002 set up on purpose. The monorepo exists so a change to a shared component doesn't need a version bump and publish step, and so the labs and packages sit right next to the site they document. Splitting the site out for a one-line deploy flag would be solving a Workers problem by breaking a cohesion decision we made deliberately, which left the third option — deploy as a Worker with static assets, no server code, no main entry point, just the built directory served from the edge, functionally what Pages was already doing.

### 4. The decision and what it costs going forward

**Host:** So walk me through what actually landed. It's an assets block pointing at the dist folder, no main entry point, and a deploy command that names the config file explicitly — why does that last part matter so much?

**Guest:** Because without naming wrangler.toml, the CLI tries to auto-detect a workspace and gets confused inside a monorepo, and it only breaks here, which is exactly the kind of failure someone simplifies away without noticing. That's why the explanation lives in the config file itself, right next to the flag, instead of in an ADR nobody rereads. Same logic applies to SITE\_URL — we set it explicitly now instead of trusting CF\_PAGES\_URL to be there, because a silent absence is fine but a silently wrong value isn't.

**Host:** And the tradeoffs ride along with it — preview URLs look different now, but you've bought yourself an easier path if real server logic ever shows up, and CI still can't confirm any of this actually worked, only that it built. That last part feels like the honest ending to this whole story: the config can be right and you still have to go look. Which is exactly why that post-deploy checklist exists.

### Not covered

The planner wanted these and found nothing in the source to support them:

- A deeper narrative about the original GitHub Pages era and the base-path link prefixing work (only tangentially referenced here, not the focus of ADR-0007)
