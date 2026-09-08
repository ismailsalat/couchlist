/** Small marker so a tester always knows which environment they are in. */
export function TestModeBanner() {
  return (
    <div className="border-b border-primary/20 bg-primary/10 px-4 py-1.5 text-center text-xs font-bold tracking-wide text-primary-hover">
      🧪 TEST MODE
    </div>
  );
}
