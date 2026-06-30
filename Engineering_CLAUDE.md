# Engineering CLAUDE.md

> Engineering rules for AI coding agents — drop these into a project's `CLAUDE.md`
> (or `AGENTS.md`) so the agent writes code you will not have to rewrite.

**What this is.** A distilled, copy-pasteable set of rules for getting a language
model to produce code that survives review. Adapted from Andrej Karpathy's
widely-shared *CLAUDE.md* working notes on LLM-assisted programming.

**Why it lives here.** These are project-agnostic *craft* rules, not DeerFlow
architecture. If you want to contribute to
[bytedance/deer-flow](https://github.com/bytedance/deer-flow), paste the rules
below into the project's `CLAUDE.md` before you let a coding agent loose — in
DeerFlow, `CLAUDE.md` imports `AGENTS.md`, so append them to the relevant
`AGENTS.md`. They complement DeerFlow's existing repo-orientation docs (which
tell an agent *where things are*) by telling it *how to write and change code*,
so its contributions land closer to mergeable on the first try.

**The premise.** Language models make *predictable, repeated* mistakes when they
write code — not random ones, the same ones, over and over. A model is fast at
generating plausible code and slow to notice that plausible is not the same as
correct. So the discipline has to come from the process around it. The following
are not suggestions; they are rules.

---

## I. Read before you write

The biggest source of bad model-written code is writing before reading the
codebase. Read the files you are about to touch — read, not skim. Copy the
patterns that already exist, and check the imports to see what the project
actually depends on, so you do not reach for `axios` where everything is `fetch`.
When you cannot find a pattern, ask instead of guessing.

## II. Think before you code

Figure out what you are doing before you type. State your assumptions ("add
authentication" is five different things, so name the one you picked) and name
the tradeoffs. If something is genuinely confusing, stop and ask rather than
filling the gap with plausible-looking code; that is exactly the code that passes
a casual review and fails when it matters.

## III. Simplicity

Write the minimum code that solves the problem in front of you now, not the
minimum that could solve every future version of it. Resist premature
abstraction, skip error handling for errors that cannot occur, and hardcode
values until there is a real reason to configure them. The test: if the only
reason something is abstracted is "in case we need to," you have over-built it.

## IV. Surgical changes

Your diff should be as small as the task allows. Do not touch what you were not
asked to touch, match the existing style, and do not reformat; a formatter pass
buries the three lines that matter inside three hundred that do not. The test is
whether you can justify every changed line by the task. If a line is there
because "while I was in there," revert it.

## V. Verification

The gap between code that works and code you think works is testing. When fixing
a bug, write the failing test first, watch it fail, then fix it; that is the only
proof you fixed the cause and not the symptom. Test behavior that can actually
break, not that a constructor sets a field. If something is hard to test, that is
information about the design, not permission to skip it.

## VI. Goal-driven execution

Every task needs a success criterion before code is written. "Add validation"
becomes "reject a missing or malformed email, return 400 with a clear message,
and test both cases." For anything multi-step, state the plan first so the user
can catch a wrong approach before you spend an hour building it.

## VII. Debugging

When something breaks, investigate; do not guess. Read the whole error and the
stack trace, reproduce the problem before you change anything, and change one
thing at a time. Do not paper over an unexpected `null` with a null check; find
out why it is null, or the bug just moves somewhere quieter.

## VIII. Dependencies

Every dependency is permanent code you do not control. Before adding one, ask
whether the project or the standard library can already do it — `crypto.randomUUID()`
over a `uuid` package. When you do add one, say why, so the choice is visible
rather than smuggled into the manifest.

## IX. Communication

Say what you did and why, not just a block of code. Flag concerns even when you
did exactly what was asked, and be precise about uncertainty: "I am not sure this
library supports streaming" tells the user what to verify; "I think this should
work" does not.

## X. Common failure modes

A few patterns recur often enough to name. Catch yourself in any of these and the
right move is to stop, not to push through:

- **The Kitchen Sink** — restructuring half the codebase while you are at it.
- **The Wrong Abstraction** — abstracting before you have copy-pasted twice.
- **The Optimistic Path** — handling the happy path and ignoring the 500.
- **The Runaway Refactor** — a fix that cascades across files.

---

*Adapted from Andrej Karpathy's* CLAUDE.md: Field Notes on Getting a Language
Model to Write Code You Will Not Rewrite *(working notes on LLM-assisted
programming). Reproduced here as a contributor aid; rules are subject to revision
as the models change.*
