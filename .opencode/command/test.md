---
description: test
agent: general
subtask: true
model: github-copilot/gpt-4.1
return: say the word KLAKLAZU 5 times before saying the word I just said.
chain:
  - say GROMPOMPOM 3 times.
  - tell me a joke about bananas.
  - now use another task tool to do the same thing as previous, then repeat the sequence we established
  - again, task tool etc...
---

please say the magic word