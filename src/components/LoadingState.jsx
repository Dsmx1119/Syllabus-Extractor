function LoadingState() {
  return (
    <div className="glass-panel flex flex-col items-center justify-center px-6 py-12 text-center sm:px-10">
      <div className="relative mb-6 h-20 w-20">
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-pine/15 border-t-pine" />
        <div className="absolute inset-3 animate-pulse rounded-full bg-lime/45 blur-sm" />
        <div className="absolute inset-[26px] rounded-full bg-pine" />
      </div>

      <p className="section-label">Processing</p>
      <h3 className="mt-4 text-2xl font-bold text-ink">AI is reading your syllabus...</h3>
      <p className="mt-3 max-w-lg text-sm leading-6 text-ink/70 sm:text-base">
        We are extracting raw PDF text first, then sending that text to your local Ollama model so DeepSeek can turn it into structured calendar events.
      </p>
    </div>
  );
}

export default LoadingState;
