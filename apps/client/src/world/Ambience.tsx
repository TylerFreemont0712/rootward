const PARTICLES = 28;

/**
 * Drifting particles over a zone, picked by the zone's `ambience`: embers rising in the Foundry, leaves falling in the
 * Bastion. Purely decorative; the reduced-motion rule in global.css stops them. Positions and timings come from the
 * particle's index, so the pattern is the same on every render without any randomness.
 */
export function Ambience({ kind }: { kind: string }) {
  if (kind !== "embers" && kind !== "leaves") return null;
  return (
    <div className={`ambience ${kind}`} aria-hidden="true">
      {Array.from({ length: PARTICLES }, (_, index) => (
        <i
          key={index}
          style={{
            left: `${(index * 37 + 11) % 100}%`,
            animationDelay: `${-((index * 7919) % 97) / 10}s`,
            animationDuration: `${7 + ((index * 13) % 60) / 10}s`,
          }}
        />
      ))}
    </div>
  );
}
