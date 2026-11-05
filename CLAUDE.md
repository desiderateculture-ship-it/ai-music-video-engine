# AI Music Video Engine: notes for Claude Code

The user makes 9:16 music video reels for real people from their own footage. Read README.md first. A job lives in `job_<client>/` (a copy of `job/`); the demo is `job/`.

## Hard rules

- No children in any shot unless the user confirms a parent approved it. Log every time range with a child in `prep.py` and keep clip windows clear of them. Check rendered frames too.
- Only use footage and photos the user says are cleared.
- Never put facts on screen (records, titles, names) that the client hasn't confirmed.
- Never commit client material. It stays in the git-ignored folders.

## Lessons from real jobs

- Pull the look from the client's own artwork: logo, merch colours, fonts. Don't reuse another client's look with a colour swap.
- Frame 0 is the Instagram thumbnail. With a logo cover, set `kcover: False` on the first segment, or the first lyric stacks on the logo.
- Set the song's BPM to the edit's grid. ACE-Step holds tempo exactly and starts on the bar, so takes drop straight onto the grid with no offset.
- Generate many seeds. Takes are cheap, and few land their drop where the edit needs it.
- ACE-Step garbles fast rap. Keep verses short, hooks chanted.
- Never use whisper's word times for sung lyrics: they ran up to 0.8 s early. Use `music/align.py`, then check the opening line and lines after gaps by hand against the vocal stem's loudness.
- You can't hear audio. Say so, and ask the user to listen before anything goes to the client.
- `GRADE = {'red': 0}` gives natural colour. The default grade tints the shadows red.
- Launch long renders detached so they outlive the session. On Windows: `Start-Process` with Git Bash running a script.
- In Python on Windows, write paths as raw strings: `C:\Users` is read as an escape otherwise.
