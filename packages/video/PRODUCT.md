# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Working and aspiring Principal and Staff AI engineers, AI platform engineers, AI architects, and founding AI engineers. They watch on a laptop with focus, usually to learn a system properly or to prepare for senior interview rounds, and they are impatient with filler: they came to understand how a production system works and where it breaks.

## Product Purpose

Atlas of Engineering is a YouTube channel of narrated, diagram-led explainers. This package renders one video per module of the Principal AI Engineer Handbook (sixteen Learn modules, the first series on the channel), each 5 to 8 minutes. Success is a viewer who can explain the module's central decision and its failure modes afterward, and who continues to the written module, the lab, and the next video.

## Positioning

Every diagram on screen is drawn from the handbook's own source diagrams and claims, so a video cannot drift from the written module. A neighbouring channel could not truthfully copy that: the videos are rebuilt from the handbook when it changes.

## Operating Context

Videos are rendered with Remotion at 1920x1080 (4K master available), 30 fps, narrated by a single synthetic voice (the author's own cloned voice is planned), and published to YouTube with captions and chapters. Narration length sets scene length. Diagrams come from the module's `.mmd` files, laid out with ELK.

## Capabilities and Constraints

- Module pages, labs, and diagrams are the source of truth; script claims must trace to them.
- Narration is AI-generated and is disclosed in every video description.
- Scenes are sized from measured narration audio; reveals are cued to spoken words.
- Pronunciation fixes for the speech model live in `src/videos/speech.ts`.
- The channel and handbook are not monetised; the goal is the highest-quality teaching content.

## Brand Commitments

- Channel name: Atlas of Engineering. The handbook is the first playlist, titled Principal AI Engineer Handbook.
- Handbook indigo identity (tokens in `packages/ui/src/tokens.css`, navy `#14113F` as the deepest ground) carries through to the channel. The channel logo is a compass rose built from connected nodes.
- Direction pinned by the author: an atlas / cartography visual world.

## Evidence on Hand

- Sixteen written modules with Mermaid diagrams under `apps/handbook/src/content/docs/learn/modules/`.
- Labs under `labs/`, with matching architecture pages.
- No audience analytics yet; no testimonials or view counts exist and none may be implied.

## Product Principles

1. Teach one decision per video, and make the viewer feel its cost before explaining it.
2. Every second shows something that explains what is being said; no frame is a title over empty space.
3. A claim on screen traces to the handbook; illustrative values are labelled illustrative.
4. Diagrams are the content, so they stay readable at laptop size and are built up in step with the narration.

## Accessibility & Inclusion

Captions on every video; text at laptop-readable size; meaning never carried by colour alone; no flashing.
