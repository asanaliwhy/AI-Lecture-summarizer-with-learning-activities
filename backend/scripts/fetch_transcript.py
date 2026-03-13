#!/usr/bin/env python3
"""Fetch YouTube transcript and print as plain text to stdout.

Usage: python3 fetch_transcript.py <video_id>
Exit 0 + transcript text on stdout = success
Exit 1 + error message on stderr   = failure
"""
import sys
import os
import signal

# Force UTF-8 output on Windows
os.environ["PYTHONIOENCODING"] = "utf-8"
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


def _timeout_handler(signum, frame):
    print("transcript fetch timed out after 25s", file=sys.stderr)
    sys.exit(1)


# SIGALRM works on Unix (Linux/macOS). On Windows, Go-side timeout still applies.
if hasattr(signal, "SIGALRM"):
    signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(25)

def main():
    if len(sys.argv) < 2:
        print("usage: python3 fetch_transcript.py <video_id>", file=sys.stderr)
        sys.exit(1)

    video_id = sys.argv[1]

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        print("youtube-transcript-api not installed", file=sys.stderr)
        sys.exit(1)

    # Optional proxy support for cloud environments (Railway, etc.)
    # Set in environment:
    #   YT_PROXY_URL=http://user:pass@host:port
    # or rely on HTTPS_PROXY/HTTP_PROXY.
    proxy_url = (
        os.getenv("YT_PROXY_URL")
        or os.getenv("HTTPS_PROXY")
        or os.getenv("https_proxy")
        or os.getenv("HTTP_PROXY")
        or os.getenv("http_proxy")
    )

    try:
        if proxy_url:
            # Keep compatibility across youtube-transcript-api versions by
            # using standard requests proxy environment variables.
            os.environ.setdefault("HTTPS_PROXY", proxy_url)
            os.environ.setdefault("HTTP_PROXY", proxy_url)

        ytt = YouTubeTranscriptApi()

        # Try English first
        try:
            t = ytt.fetch(video_id, languages=["en", "en-US", "en-GB"])
        except Exception:
            # Fallback: any available language
            t = ytt.fetch(video_id)

        text = " ".join(snippet.text for snippet in t.snippets)
        text = text.strip()

        if not text:
            print("transcript is empty", file=sys.stderr)
            sys.exit(1)

        # Write to stdout
        sys.stdout.write(text)

    except Exception as e:
        print(f"transcript fetch failed: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    finally:
        if hasattr(signal, "SIGALRM"):
            signal.alarm(0)
