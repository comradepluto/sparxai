# ai homework helper for sparx maths

browser extension for sparx maths homework. take a screenshot of a question, the extension reads it, and gives you an answer.

## what it does

- takes a screenshot of your screen
- reads the question including graphs and math notation
- gives you an answer
- lets you choose a solver model
- saves your answered questions in the bookwork tab

## installation

works in firefox and chromium browsers like chrome edge and brave.

1. download or clone this repository
2. open your browser extensions page:
   - chrome edge brave: chrome://extensions
   - firefox: about:addons then gear icon then debug add-ons
3. enable developer mode
4. click load unpacked and select the extension folder from this repo
5. pin the extension to your toolbar

## setup

get a groq api key at https://console.groq.com/keys

1. open the extension settings tab
2. paste your key
3. click save

## models

vision reads your screenshot: meta-llama/llama-3.2-90b-vision-preview

solver gives the answer: choose from the dropdown on the answer tab. default is openai/gpt-oss-120b. other options: deepseek r1 distill 70b llama 3.3 70b llama 3.1 8b.

your model choice is saved automatically.

## note

this extension uses ai so answers may be wrong. try again if something looks off.

this project is not affiliated with or endorsed by sparx ltd or sparx maths.

## license

mit license - see the license file for details.

(this project is a fork of https://github.com/Sparx-Hax/Sparx-Hax/ , i am not affiliated with them.)
