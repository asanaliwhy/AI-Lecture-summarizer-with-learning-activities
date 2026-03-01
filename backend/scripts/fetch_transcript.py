"""Fetch YouTube transcript and print as plain text to stdout.

Usage: python fetch_transcript.py <video_id>
Exit 0 + transcript text on stdout = success
Exit 1 + error message on stderr   = failure
"""
import sys
import os

# Force UTF-8 output on Windows
os.environ["PYTHONIOENCODING"] = "utf-8"
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

def main():
    if len(sys.argv) < 2:
        print("usage: fetch_transcript.py <video_id>", file=sys.stderr)
        sys.exit(1)

    video_id = sys.argv[1]

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        print("youtube-transcript-api not installed", file=sys.stderr)
        sys.exit(1)

    try:
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
    main()
