### 1. "It's Just HTTP" Undersells Streaming

**Host:** So we say 'it's just HTTP' like that settles everything, but with AI infrastructure that phrase is doing a lot of hiding. These responses aren't arriving as one neat package anymore, they're streaming token by token, and what happens to that stream between your server and the user's screen depends on decisions most teams never think about.

**Guest:** Right, and the frustrating part is the stream can look perfect on your server and still arrive as one silent block on the client, because some proxy three hops away decided to buffer it. This module is really about that whole path — connection setup overhead, which streaming protocol you actually chose, how load balancing treats long-lived connections, and where your latency budget really goes. Get any of those wrong and 'it's just HTTP' turns into a very expensive lie.

### 2. Two Mental Models: Setup Cost vs. Work Cost, and Time-to-First-Token

**Host:** So let's ground this in the mental model before we get into protocols. When you say setup cost versus work cost, what's actually happening before any of my request even gets processed?

**Guest:** Every connection pays a toll before it does any real work — DNS resolution to find the address, a TCP handshake to open the connection, then a TLS handshake on top if it's HTTPS. For a short request, that toll can be more expensive than the actual work, which is why keep-alive is the highest-leverage fix here — you pay the toll once and amortize it across every subsequent request instead of paying it again and again.

**Host:** Okay, but streaming adds a second wrinkle on top of that, right — it's not just about total time?

**Guest:** Exactly, and this is the model people miss: for streaming, time-to-first-token matters more than total duration. An 8-second response that starts appearing in 200 milliseconds feels fast because the user watches it build; a 3-second response that arrives as one silent block feels slow even though it's objectively quicker — and that's entirely a perception problem created by where the bytes actually show up in time.

### 3. The Architecture: A Gateway-to-Client Path That Must Stay Transparent

**Host:** So if time-to-first-token is the perception game, what's actually the architecture that lets those early bytes show up fast? Walk me through the path from gateway to client.

**Guest:** Picture the request going from gateway to client, and the rule is simple to state but easy to violate: every single hop has to forward bytes as they arrive, not wait to assemble the full response. It's an infrastructure-wide property — one buffering proxy anywhere in that chain, and every request through it silently reverts to block delivery, even if your app code streams perfectly. The second commitment is disconnect detection has to happen at the gateway per chunk, not once at connection start, because if a client bails mid-stream, you need the gateway to notice immediately and stop pulling tokens upstream — otherwise you're generating and paying for a response nobody's there to receive.

### 4. Paying the Setup Tax: DNS, TCP, TLS, and the HTTP/1.1 → 2 → 3 Story

**Host:** Okay, before we even get to streaming behavior, there's a tax you pay just to open the connection in the first place. Walk me through what that actually costs in round trips.

**Guest:** Every fresh HTTPS connection pays DNS resolution if it's not cached, a TCP handshake that's one round trip, and a TLS handshake — one round trip on TLS 1.3, or effectively zero extra with 0-RTT resumption if you've talked to that server before. Add it up and you're looking at two to three round trips of pure setup before a single byte of your actual request moves, which for a server one network hop away is real time. That's exactly why a service hammering the same upstream repeatedly should be reusing connections, not paying that tax fresh on every call — and it's also why DNS caching is a trade-off, not a free lunch, since caching too aggressively past the TTL means you can keep routing to a dead backend for a scary long time after a failover.

**Host:** So once the connection's open, that's where HTTP/1.1 versus 2 versus 3 comes in — what actually changes for a bunch of concurrent streaming completions sharing infrastructure?

**Guest:** HTTP/1.1 only sends one request at a time per connection, so clients just open multiple connections to fake concurrency. HTTP/2 fixes that by multiplexing many requests over a single TCP connection — but because it's still TCP underneath, one lost packet stalls every multiplexed stream on that connection, so streams that have nothing to do with each other end up blocking on each other's retransmission. HTTP/3 runs on QUIC over UDP instead, giving each stream independent loss recovery, so a lost packet on one completion's stream doesn't stall the twenty other completions sharing that connection — which matters a lot the moment you're multiplexing many concurrent streaming responses through the same pipe.

### 5. DNS Caching's TTL Trade-off — and When It Bites

**Host:** So DNS caching feels like it should be a solved, boring problem, but you're telling me it has a real trade-off built into it. What's the tension?

**Guest:** Cache the resolved IP aggressively and you save resolution round trips on every request, which is great for latency. But cache it too aggressively and you're slow to notice when infrastructure actually changes underneath you — say a load balancer fails over to a new IP. I've seen the exact production bug this causes: someone switches DNS, and twenty minutes later they're still getting reports of traffic hitting the old, dead load balancer, because some fraction of clients cached the old IP past its TTL and just never re-resolved.

### 6. Choosing a Streaming Protocol: SSE, WebSockets, gRPC

**Host:** Okay, so DNS is sorted, the handshake tax is paid — now you actually have to pick how the tokens travel from your server to the browser. There's SSE, there's WebSockets, there's gRPC streaming. How do you choose?

**Guest:** For a one-directional LLM completion — server pushing tokens to a client that isn't sending anything back mid-stream — SSE is almost always the right call, and the reason is boring in the best way: it's just plain HTTP with a text/event-stream content type. It works through basically every proxy and load balancer you already have without special configuration, and browsers even reconnect automatically if the connection drops. WebSockets give you full bidirectional communication, but you're not using that for a completion stream, and you're paying for it in infrastructure that has to explicitly support the protocol upgrade — some proxies and load balancers need extra config just to let that handshake through. gRPC streaming is efficient and strongly typed, which sounds great, but it requires HTTP/2 end-to-end, meaning every single intermediary between you and the client has to support it, and that's a much bigger operational ask than just serving an HTTP response.

**Host:** So it's really a case of matching the protocol's capabilities to what you actually need, not what sounds most sophisticated.

**Guest:** Exactly — bidirectional and strongly-typed are both genuinely useful properties, just not for this shape of problem. The moment you need the client streaming data back concurrently, WebSockets earn their keep. But for the common case of a prompt in, tokens out, SSE demands the least from the path in between, and 'demands the least from the path in between' is exactly what you want when that path includes proxies and load balancers you don't control.

### 7. Load Balancing, Latency Budgets, and Where LBs Hit Their Ceiling

**Host:** Okay, so once you've picked SSE, you still have to get the request through a load balancer without wrecking that latency budget. Walk me through the L4 versus L7 choice here.

**Guest:** L4 just looks at IP and port and shoves packets along — it's fast and cheap but blind to what's actually in the request, so it can't route a request by tenant or API version. L7 terminates more of the connection and actually reads headers or paths, which lets you do that smarter routing, but that inspection costs real latency and CPU per request. And that cost matters more than it sounds like — a same-datacenter round trip is something like half a millisecond, but cross-continent is 100 to 150 milliseconds, so any latency an L7 hop adds is competing against a budget where the floor is already set by physics, not by your code.

**Host:** So what happens when the load balancer itself becomes the bottleneck, not just an added hop?

**Guest:** Every load balancer has its own ceiling on connections and throughput, and once you're near it, adding more backend capacity behind it doesn't help — the LB itself is the constraint. At that point you either scale the load balancer horizontally, or you use something like Direct Server Return, where the LB handles the incoming request but the response goes straight from the backend to the client, taking the LB out of the return path entirely.

### 8. Inside the Disconnect-Aware Streaming Loop

**Host:** So let's actually look at the code that lives at the bottom of all this theory. There's this is\_disconnected check inside the streaming loop — walk me through why it's called on every single chunk instead of just once when the connection opens.

**Guest:** Because a client can vanish at any point in a long stream, not just at the start. If you only checked once, you'd catch the person who closes the tab immediately, but you'd completely miss someone who bails halfway through a long generation. So the check sits inside the async for loop, right before you yield each chunk, and the moment it comes back true you break and stop pulling from the provider entirely.

**Host:** And separately from that disconnect logic, you're also timing first token specifically, not just the whole stream duration. Why does that deserve its own percentile bucket instead of just folding into total latency?

**Guest:** Because a slow-starting stream and a long-running stream look identical if you only track total duration, but they need entirely different fixes. Tracking first-token time as its own p50, p95, p99 distribution lets a dashboard tell those two situations apart at a glance, rather than burying one inside the other.

### 9. The Real Cost of Ghost Streams

**Host:** Okay, let's make this painfully concrete, because 'latency budgets' can feel abstract until you attach a dollar figure to it. Walk me through what actually happens when someone closes a chat tab three seconds into a ten-second response.

**Guest:** Without disconnect detection, nothing stops. The gateway keeps calling the upstream provider for the remaining seven seconds, and the provider keeps generating and billing tokens, because as far as it knows there's still a client waiting. You're paying full metered compute for a response that vanished into a closed socket with zero eyeballs on it.

**Host:** And that's not a one-off annoyance, that's a scaling problem — thousands of concurrent streams, some steady percentage of tab-closers, it just compounds. So is that why disconnected gets its own counter in StreamTelemetry instead of just folding into completed?

**Guest:** Exactly — so the cost is bounded to those three seconds instead of ten. But the counter matters beyond savings: a rising disconnect rate is a signal. Maybe responses are too slow and people are bailing, maybe a client has a bug that's closing streams early. Bury that inside 'total requests served' and you'd never see it coming.

### 10. Failure Modes: Buffering Proxies, Head-of-Line Blocking, Idle Timeouts

**Host:** Okay, so let's talk about how streaming actually dies in production, because I feel like this is the part that bites people who did everything right in their own code. What's the number one culprit?

**Guest:** It's almost always a buffering proxy sitting in front of the gateway. Nginx's default is to buffer the whole response, meaning it collects the entire upstream response before forwarding a single byte — so your beautiful token-by-token stream turns into one silent block that lands all at once. And the cruel part is it's invisible locally, because in dev your client usually talks straight to the gateway with nothing in between.

**Host:** So you can ship something that streams perfectly on your laptop and then watch it go silent-then-dump the moment it's behind a real proxy. Is that the only place things quietly break, or are there other traps like this?

**Guest:** A few more worth knowing. HTTP/2 multiplexes several streams over one TCP connection, so one lost packet on an unrelated slow stream can stall every other stream sharing that connection — completely unrelated requests start stuttering together. There's also idle-timeout mismatches between a proxy and a client, which cause random-looking connection resets that actually line up exactly with the timeout window once you check. Best part is you can reproduce the buffering issue in ten minutes: put nginx in front of the gateway's stream endpoint with response buffering switched on, watch it arrive as one block, then switch buffering off and tell the proxy not to accelerate-buffer the response, and watch streaming come back instantly.

### 11. Securing and Scaling the Streaming Path

**Host:** Let's shift to hardening this path, because a streaming endpoint that's fast but insecure isn't much of a win. Where does security actually bite here that's specific to streaming, versus generic API security advice?

**Guest:** TLS needs to be everywhere, including internal service-to-service hops, not just the public edge, and someone needs to actively watch certificate expiry because that's a boring, entirely preventable cause of outages that still takes down production systems constantly. For zero-trust designs, mTLS on service-to-service traffic establishes identity cryptographically per-connection instead of assuming trust from network location. DNS itself is a trust boundary, not just a lookup table, so spoofing and cache poisoning are real risks, and DNSSEC belongs in the picture where the threat model justifies it. And a sneaky one: a permissive Access-Control-Allow-Origin wildcard on a streaming endpoint that also handles authenticated requests is a common, easy-to-miss exposure — layer rate limiting at both the edge and the application so one bug in one layer isn't the only thing standing between you and abuse.

**Host:** Okay, and once that's locked down, what breaks first when you actually try to scale this thing across regions and high fan-out?

**Guest:** Connection pool sizing becomes a real constraint — too small and requests queue waiting for a connection, too large and you risk exhausting file descriptors, or behind NAT, ephemeral ports, and SNAT port exhaustion is a genuinely painful ceiling to hit in NAT-heavy cloud topologies at scale. And for multi-region deployments, you need latency-aware routing like geo-DNS or anycast, because without it a user gets routed to a healthy backend in the wrong region, trading availability for a latency budget far worse than what those setup-cost numbers from earlier suggested you'd need to accept.

### 12. Closing: Interview-Ready Takeaways and Where to Go Deeper

**Host:** So if someone drops us into an interview tomorrow and asks us to name the signals that show real networking judgment for streaming AI systems, what's the short list? Give us the version that sounds sharp in five sentences.

**Guest:** Three things, and we've already built each one out in detail earlier, so here they are as the compressed, interview-ready version. First, the latency breakdown — DNS, TCP handshake, TLS handshake, request transmission, server processing, first byte — treated as distinct, separately measurable stages, the way we covered under the setup tax and latency budget discussions. Second, the SSE-over-WebSockets call for a one-directional completion stream, for the exact reasons we laid out when choosing a streaming protocol: plain HTTP, no upgrade handshake, no unused bidirectional overhead. And third, the disconnect answer we built out in the disconnect-aware streaming loop and the ghost-streams discussion: check state on every chunk, stop pulling from upstream immediately, tie it to its own counter, and remember that in AI infrastructure an undetected disconnect is metered per-token spend on a response nobody's watching. If you want to go deeper than the interview answer, Grigorik's High Performance Browser Networking is still the best treatment of the TCP and TLS mechanics, the HTTP/2 and HTTP/3 RFCs cover the multiplexing and head-of-line-blocking details directly, and the async-ai-gateway lab is the actual disconnect-aware implementation this whole module was drawn from — that's where the mental models turn into working code.
