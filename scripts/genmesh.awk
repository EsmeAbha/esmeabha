# Emits a constellation mesh: pseudo-random nodes, edges between near
# neighbours, as SVG. Deterministic (fixed seed) so the art never shifts.
BEGIN {
  srand(SEED + 0)
  W = 1400; H = 420; OX = -60; OY = -40
  N = NODES + 0
  MAXD = MAXDIST + 0

  # Poisson-ish scatter: reject points that land too close to an existing one,
  # otherwise clumps form and the mesh reads as noise rather than a lattice.
  n = 0
  for (tries = 0; tries < N * 400 && n < N; tries++) {
    px = OX + rand() * W
    py = OY + rand() * H
    ok = 1
    for (j = 1; j <= n; j++) {
      dx = px - X[j]; dy = py - Y[j]
      if (dx*dx + dy*dy < MIN*MIN) { ok = 0; break }
    }
    if (ok) { n++; X[n] = px; Y[n] = py }
  }

  # Edges, capped by degree so no node becomes a hub.
  printf "      <g stroke=\"%s\" stroke-width=\"%s\" fill=\"none\">\n", COL, SW
  for (i = 1; i <= n; i++) {
    for (j = i + 1; j <= n; j++) {
      dx = X[i] - X[j]; dy = Y[i] - Y[j]
      d = sqrt(dx*dx + dy*dy)
      if (d < MAXD && DEG[i] < 4 && DEG[j] < 4) {
        DEG[i]++; DEG[j]++
        o = (1 - d / MAXD) * OPA
        printf "        <line x1=\"%.1f\" y1=\"%.1f\" x2=\"%.1f\" y2=\"%.1f\" stroke-opacity=\"%.2f\"/>\n", \
               X[i], Y[i], X[j], Y[j], o
        edges++
      }
    }
  }
  printf "      </g>\n"

  # Nodes, a few of them slowly twinkling.
  printf "      <g fill=\"%s\">\n", COL
  for (i = 1; i <= n; i++) {
    r = RMIN + rand() * (RMAX - RMIN)
    if (i % 7 == 0) {
      printf "        <circle cx=\"%.1f\" cy=\"%.1f\" r=\"%.2f\" opacity=\"%.2f\">", X[i], Y[i], r, NOPA
      printf "<animate attributeName=\"opacity\" values=\"%.2f;%.2f;%.2f\" dur=\"%.1fs\" repeatCount=\"indefinite\"/></circle>\n", \
             NOPA, NOPA * 0.25, NOPA, 4 + (i % 5)
    } else {
      printf "        <circle cx=\"%.1f\" cy=\"%.1f\" r=\"%.2f\" opacity=\"%.2f\"/>\n", X[i], Y[i], r, NOPA
    }
  }
  printf "      </g>\n"
  printf "<!-- nodes=%d edges=%d -->\n", n, edges
}
