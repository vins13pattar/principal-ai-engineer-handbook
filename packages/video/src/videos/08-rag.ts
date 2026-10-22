import type { VideoScript } from "./types.ts";

/**
 * Module 8 — RAG. Every claim below is drawn from
 * apps/handbook/src/content/docs/learn/modules/08-rag.mdx; the narration is the editable
 * artifact, and `at` values are fractions of a scene until narration timestamps replace them with cues.
 */
export const rag: VideoScript = {
  slug: "08-rag",
  module: "08",
  plate: "PLATE 08 · RAG",
  chapter: "RAG",
  title: "RAG: two pipelines that must stay in sync",
  youtube: {
    titleSuffix: "RAG: two pipelines that must stay in sync",
    summary:
      "Why retrieval quality is the ceiling on answer quality: the ingestion and query pipelines, chunking, hybrid retrieval and re-ranking, access control inside the search itself, and keeping the index fresh. Module 8 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 8 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/08-rag/",
      },
      {
        label: "Lab: Hybrid Retrieval and Evaluation",
        url: "https://handbook.vinodspattar.in/build/labs/hybrid-retrieval/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "RAG",
      "retrieval augmented generation",
      "vector search",
      "embeddings",
      "AI engineering",
      "system design",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "Confidently quoting yesterday's page",
      narration:
        "A support bot confidently quotes a pricing page that changed yesterday. The model did nothing wrong. The page changed, but the index was never rebuilt, so retrieval handed the model the old text. From the outside, it looks identical to a generation failure, and it is not one. That is the heart of retrieval-augmented generation: two pipelines that must stay in sync, and retrieval quality as the hard ceiling on every answer.",
      map: {
        places: [
          { id: "doc", label: ["Pricing page", "changed yesterday"], x: 0, y: 70, w: 340, h: 100 },
          {
            id: "idx",
            label: ["Vector index", "not rebuilt"],
            x: 560,
            y: 226,
            w: 340,
            h: 100,
            beat: 0,
          },
          { id: "q", label: ["Customer question"], x: 0, y: 384, w: 340, beat: 1 },
          { id: "ans", label: ["Confident answer"], x: 1200, y: 226, w: 340, beat: 1 },
        ],
        links: [
          { from: "doc", to: "idx", beat: 0, arrow: "end", dashed: true, tone: "fault" },
          { from: "q", to: "idx", beat: 1, arrow: "end" },
          { from: "idx", to: "ans", beat: 1, arrow: "end" },
        ],
      },
      runs: [
        {
          beat: 0,
          paths: [["doc", "idx"]],
          results: ["stall"],
          marks: ["change never indexed"],
        },
        {
          beat: 1,
          paths: [["q", "idx", "ans"]],
          results: ["fail"],
          marks: ["old price, stated as fact"],
        },
      ],
      captions: [
        "The page changed. The index was never rebuilt.",
        "Retrieval hands the model the old text, and the answer is fluent and wrong.",
        "Not a generation failure. A retrieval failure that looks identical.",
      ],
      beats: [
        { at: 0 },
        { at: 0.3, cue: "so retrieval handed the model the old text" },
        { at: 0.58, cue: "From the outside" },
      ],
    },
    {
      id: "pipelines",
      kind: "diagram",
      layout: "08-rag.pipelines",
      headline: "Two pipelines, one index between them",
      narration:
        "RAG is two pipelines, not one. The ingestion pipeline runs ahead of time. Source documents are chunked, each chunk is embedded, and the vectors are written into a vector index. The query pipeline runs per request. The user's query is embedded with the same embedding model, and the search compares it against the index. Notice that the access-control filter sits inside that search step, not bolted on afterward. Then an optional second stage re-ranks the candidates. The prompt is constructed from instructions plus the retrieved chunks, the model answers, and that is the response. Almost every RAG failure traces back to these two pipelines drifting out of sync.",
      legend: [
        { kind: "place", label: "step" },
        { kind: "store", label: "vector index" },
        { kind: "route", label: "data flow" },
        { kind: "region", label: "one pipeline" },
      ],
      steps: [
        {
          at: 0,
          show: ["Ingestion", "Docs", "Chunk", "e1"],
          focus: ["Ingestion", "Docs", "Chunk", "e1"],
          camera: ["Ingestion"],
        },
        {
          at: 0.2,
          cue: "each chunk is embedded",
          show: ["EmbedIngest", "e2"],
          focus: ["Chunk", "EmbedIngest", "e2"],
          camera: ["Ingestion"],
        },
        {
          at: 0.28,
          cue: "written into a vector index",
          show: ["Index", "e3"],
          focus: ["EmbedIngest", "Index", "e3"],
          camera: ["Ingestion"],
        },
        {
          at: 0.38,
          cue: "The query pipeline runs per request",
          show: ["Query", "Q"],
          focus: ["Query", "Q"],
          camera: ["Index", "Q", "ANN"],
        },
        {
          at: 0.47,
          cue: "embedded with the same embedding model",
          show: ["EmbedQuery", "e4"],
          focus: ["Q", "EmbedQuery", "e4"],
          camera: ["Index", "Q", "ANN"],
        },
        {
          at: 0.57,
          cue: "the search compares it against the index",
          show: ["ANN", "e5", "e6"],
          focus: ["EmbedQuery", "ANN", "Index", "e5", "e6"],
          camera: ["Index", "EmbedQuery", "ANN"],
        },
        {
          at: 0.66,
          cue: "Notice that the access-control filter",
          show: [],
          focus: ["ANN"],
          camera: ["EmbedQuery", "ANN", "Rerank"],
        },
        {
          at: 0.76,
          cue: "an optional second stage re-ranks",
          show: ["Rerank", "e7"],
          focus: ["ANN", "Rerank", "e7"],
          camera: ["ANN", "Rerank", "Prompt"],
        },
        {
          at: 0.84,
          cue: "The prompt is constructed",
          show: ["Prompt", "e8", "Model", "e9", "Response", "e10"],
          focus: ["Rerank", "Prompt", "Model", "Response", "e8", "e9", "e10"],
          camera: ["Rerank", "Prompt", "Model", "Response"],
        },
      ],
    },
    {
      id: "chunking",
      kind: "axis",
      headline: "Chunking is a design decision",
      narration:
        "Chunking is the first design decision. Documents are split into chunks small enough to embed and retrieve individually. Fixed-size chunking is simple but indifferent to structure: it can split a table, or a procedure's steps, across two chunks and destroy the context that made either half useful. Overlapping chunks, where a chunk shares some content with its neighbor, reduce that risk, at the cost of redundant storage and embedding compute. Semantic chunking splits on paragraph, section or heading boundaries, which respects structure at the cost of variable chunk sizes. And size is a trade-off too. Too small loses context. Too large dilutes relevance and wastes context window.",
      ends: ["indifferent to document structure", "respects document structure"],
      stations: [
        {
          name: "Fixed-size",
          line: "Simple to build",
          detail: "Can split a table or a procedure's steps across two chunks.",
        },
        {
          name: "Overlapping",
          line: "Neighbors share content",
          detail: "Fewer bad splits, at the cost of redundant storage and embedding compute.",
        },
        {
          name: "Semantic",
          line: "Splits on headings",
          detail: "Respects structure, at the cost of variable chunk sizes.",
        },
      ],
      beats: [
        { at: 0.2, cue: "Fixed-size chunking is simple" },
        { at: 0.44, cue: "Overlapping chunks, where" },
        { at: 0.68, cue: "Semantic chunking splits" },
      ],
    },
    {
      id: "hybrid",
      kind: "lanes",
      headline: "Dense and sparse fail differently",
      narration:
        "Next, finding the chunks. A chunk and a query are both mapped to dense vectors by an embedding model, and retrieval finds the closest, typically by cosine similarity. Exact nearest neighbor search does not scale past a modest index, so production systems use approximate nearest neighbor search, trading a little recall for a large gain in speed. Dense retrieval is good at meaning, but can miss an exact product code or error message the user typed. Keyword retrieval is the reverse: excellent at exact matches, blind to paraphrasing. Combine both, merged by reciprocal rank fusion, and you usually beat either alone, because they fail in different ways.",
      lanes: [
        {
          title: "Dense (embeddings)",
          subtitle: ["Good at meaning. Can miss an exact SKU or error code."],
          chain: ["Query", "Closest vectors", "Similar meaning"],
        },
        {
          title: "Sparse (BM25)",
          subtitle: ["Excellent at exact matches. Blind to paraphrasing."],
          chain: ["Query", "Keyword match", "Exact terms"],
        },
        {
          title: "Hybrid",
          subtitle: ["They fail in different ways, so together they usually win."],
          chain: ["Dense and sparse", "Reciprocal rank fusion", "One ranked list"],
        },
      ],
      beats: [
        { at: 0.5, cue: "Dense retrieval is good at meaning" },
        { at: 0.68, cue: "Keyword retrieval is the reverse" },
        { at: 0.82, cue: "Combine both" },
      ],
    },
    {
      id: "rerank",
      kind: "bars",
      headline: "Over-fetch cheaply, then re-rank",
      narration:
        "Then comes re-ranking, a two-stage pattern. Cheap approximate search over-fetches a larger candidate set, fifty chunks in this module's example. A more expensive cross-encoder re-ranker scores only those candidates and reorders them down to the final top five that go to the model. You pay extra latency and compute, for meaningfully better precision than single-stage retrieval gives you. And because retrieval latency is part of your time to first token budget, measure it.",
      items: [
        {
          label: "Candidates from ANN search",
          value: 50,
          unit: "chunks",
          note: "Cheap, over-fetched",
          tone: "normal",
        },
        {
          label: "Sent to the model",
          value: 5,
          unit: "chunks",
          note: "Re-ranked by a cross-encoder",
          tone: "route",
        },
      ],
      caption: "Defaults in the module's example: fetch 50 candidates, keep the top 5.",
      beats: [
        { at: 0.18, cue: "fifty chunks in this module's example" },
        { at: 0.5, cue: "the final top five" },
      ],
    },
    {
      id: "access",
      kind: "anatomy",
      headline: "Access control inside the search",
      narration:
        "Now the decision this module keeps returning to. Access control belongs inside the retrieval query, not after it. A system that fetches first and filters second has already leaked the existence and content of unauthorized documents into the ranking, and in a naive implementation, into the model's context. So the index's search method takes the tenant ID as a required parameter. And implementations must filter inside the index query itself. That makes forgetting to filter a signature mismatch a type checker catches, instead of a data leak a reviewer has to remember to look for at every call site.",
      lines: [
        { text: "class VectorIndex(Protocol):", group: "plain" },
        { text: "  async def search(", group: "plain" },
        { text: "    self, query_vector: list[float],", group: "plain" },
        { text: "    top_k: int,", group: "plain" },
        { text: "    tenant_id: str,", group: "route" },
        { text: "  ) -> list[Chunk]:", group: "plain" },
        { text: "    # MUST filter by tenant_id inside", group: "meta" },
        { text: "    # the index query itself, never", group: "meta" },
        { text: "    # afterward in application code", group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "Required, not optional",
          body: "tenant_id is part of the signature, so forgetting it is a mismatch a type checker catches.",
        },
        {
          group: "meta",
          title: "Filter inside the query",
          body: "Fetch first, filter second, and existence and content have already leaked into ranking.",
        },
      ],
      beats: [
        { at: 0.5, cue: "takes the tenant ID as a required parameter" },
        { at: 0.62, cue: "implementations must filter inside" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where it breaks, in pipeline order",
      narration:
        "Five ways it breaks, in pipeline order. First, chunk boundaries splitting relevant content, so each half retrieves as low relevance when the whole would have answered the query. Second, an embedding model version mismatch. If you re-embed with a new model but do not rebuild the index, new query vectors are compared against old chunk vectors, similarity scores become meaningless, and nothing errors. Retrieval just quietly degrades. Third, a stale index after the source data changes. Fourth, missing per-tenant access control at retrieval time, which is a correctness failure and a security failure at once. And fifth, irrelevant retrieval. If the context lacks the answer, the model often writes a fluent, confident one anyway, and no prompt engineering recovers a retrieval miss.",
      map: {
        places: [
          { id: "source", label: ["Source"], x: 0, y: 226, w: 220 },
          { id: "chunk", label: ["Chunk"], x: 300, y: 226, w: 220 },
          { id: "embed", label: ["Embed"], x: 600, y: 226, w: 220 },
          { id: "index", label: ["Index"], x: 900, y: 226, w: 220 },
          { id: "search", label: ["Search"], x: 1200, y: 226, w: 220 },
          { id: "answer", label: ["Answer"], x: 1500, y: 226, w: 220 },
        ],
        links: [
          { from: "source", to: "chunk", arrow: "end" },
          { from: "chunk", to: "embed", arrow: "end" },
          { from: "embed", to: "index", arrow: "end" },
          { from: "index", to: "search", arrow: "end" },
          { from: "search", to: "answer", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "chunk",
          title: "Boundaries split content",
          body: "A procedure or table split in two retrieves as low relevance, twice.",
        },
        {
          at: "embed",
          title: "Embedding model mismatch",
          body: "New query vectors against old chunk vectors. Nothing errors. Any change needs a full reindex.",
        },
        {
          at: "index",
          title: "Stale index",
          body: "The index silently drifts from the source of truth.",
        },
        {
          at: "search",
          title: "No tenant filter at retrieval",
          body: "Unauthorized content reaches the model. Correctness and security at once.",
        },
        {
          at: "answer",
          title: "Irrelevant retrieval",
          body: "Fluent, confident, wrong. Prompting cannot recover a retrieval miss.",
        },
      ],
      beats: [
        { at: 0.1, cue: "chunk boundaries splitting relevant content" },
        { at: 0.28, cue: "an embedding model version mismatch" },
        { at: 0.54, cue: "a stale index after the source data changes" },
        { at: 0.64, cue: "missing per-tenant access control" },
        { at: 0.82, cue: "irrelevant retrieval" },
      ],
    },
    {
      id: "freshness",
      kind: "lanes",
      headline: "Freshness is a consistency question",
      narration:
        "Freshness is a consistency problem in disguise. How stale can the index be before it matters? It is Module 2's question, applied to a search index. A legal document repository probably needs near-real-time reindexing. A general knowledge base might tolerate a daily batch. So there are two strategies. Reindex on change: a webhook or change data capture event re-chunks and re-embeds just the changed document. Near-real-time, with more moving parts. Or a periodic full reindex: rebuild the whole index on a schedule. Simpler to operate, but anything changed since the last run is served stale. Either way, choose against an explicit freshness requirement, not whatever was easiest to build.",
      lanes: [
        {
          title: "Reindex on change",
          subtitle: ["Near-real-time freshness. More moving parts."],
          chain: ["Document changes", "Webhook or change event", "Re-embed that document"],
        },
        {
          title: "Periodic full reindex",
          subtitle: ["Simple to operate. Stale until the next run."],
          chain: ["Document changes", "Wait for the schedule", "Rebuild the index"],
          tone: "fault",
        },
      ],
      takeaway: "Set the freshness requirement first. Then pick the strategy.",
      beats: [
        { at: 0.42, cue: "Reindex on change" },
        { at: 0.64, cue: "Or a periodic full reindex" },
        { at: 0.86, cue: "choose against an explicit freshness requirement" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to take away. One: RAG is two pipelines kept in sync, and retrieval quality is a ceiling, so measure retrieval and generation separately. Two: enforce access control inside the retrieval query, never after it. Three: choose chunking, hybrid search, re-ranking and reindexing against explicit requirements, and remember that any embedding model change means a full reindex. To build the whole pipeline and measure it, try the Hybrid Retrieval and Evaluation lab. Links are in the description.",
      points: [
        {
          statement: "Two pipelines, one ceiling",
          support: "Keep them in sync. Measure retrieval and generation separately.",
          glyph: "chain",
        },
        {
          statement: "Filter inside the search",
          support: "Tenant access control belongs in the retrieval query, never after it.",
          glyph: "gate",
        },
        {
          statement: "Decide from requirements",
          support:
            "Chunking, hybrid search, re-ranking, freshness. A new embedding model needs a full reindex.",
          glyph: "split",
        },
      ],
      footer:
        "Next: build the Hybrid Retrieval and Evaluation lab and measure precision and recall.",
      beats: [
        { at: 0.1, cue: "RAG is two pipelines kept in sync" },
        { at: 0.32, cue: "enforce access control inside the retrieval query" },
        { at: 0.52, cue: "choose chunking, hybrid search" },
        { at: 0.78, cue: "try the Hybrid Retrieval and Evaluation lab" },
      ],
    },
  ],
};
