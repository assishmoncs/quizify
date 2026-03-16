\# Quizify



Quizify is a JSON powered quiz engine that converts quiz JSON files into interactive quizzes.



Upload a quiz JSON file and instantly run quizzes in multiple modes.



\## Features



\- Upload JSON quiz files

\- Supports multiple JSON formats

\- Read Mode (study view)

\- Quiz Mode (instant feedback)

\- Test Mode (exam simulation)

\- Question navigator

\- Timer support

\- Shuffle questions

\- Shuffle options

\- Export results as JSON

\- Works completely offline



\## Supported JSON Format Example



```json

{

&#x20;"question":"Capital of France?",

&#x20;"option1":"Paris",

&#x20;"option2":"London",

&#x20;"option3":"Berlin",

&#x20;"option4":"Rome",

&#x20;"correct\_answer":"A",

&#x20;"explanation":"Paris is the capital of France"

}

```



\## Modes



\### Read Mode

Shows all questions and highlights the correct answer.



\### Quiz Mode

Answer questions one by one with immediate feedback.



\### Test Mode

Simulates a real exam and shows results at the end.



\## Project Structure



```

Quizify

│

├── index.html

├── css/style.css

├── js/app.js

```



\## How to Run



Download or clone the repository and open `index.html` in your browser.



No server required.



\## License



MIT

