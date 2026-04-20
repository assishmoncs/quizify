# Quizify

Quizify is a lightweight browser-based JSON to quiz converter. It loads quiz data directly from a JSON file and presents it in Read, Quiz, or Test mode without any setup.

## Features

- Supports multiple quiz JSON structures, including arrays, wrapped collections, keyed objects, numbered options, lettered options, and option objects
- Accepts answer values as indexes, letters, exact option text, booleans, or options marked as correct
- Includes Read Mode, Quiz Mode, and Test Mode with an optional countdown timer
- Filters questions by metadata such as topic, difficulty, tag, chapter, or subject
- Displays explanations and an answer review summary after quizzes/tests
- Provides result export, question shuffling, and option shuffling
- Saves your light/dark theme preference
- Runs fully in the browser

## Supported JSON Patterns

Quizify can parse quiz data from common structures such as:

- Arrays of question objects
- Objects containing `questions`, `quiz`, `items`, `data`, or `entries`
- Standalone question objects or keyed question maps
- Options provided through arrays, objects, `option1..10`, `choice1..10`, or `A..F`
- Correct answers provided as numeric index, letter, matching option text, boolean, or option object metadata
- Optional metadata fields (topic, difficulty, tag, chapter, module, subject) used for filtering
- Optional explanation fields shown in Read Mode and answer reviews

## Usage

1. Open `index.html` in a modern browser.
2. Upload a `.json` file.
3. Choose a mode and start the quiz.

## License

MIT
