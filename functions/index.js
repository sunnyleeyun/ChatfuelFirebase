const functions = require('firebase-functions');

exports.helloWorld = functions.https.onRequest((request, response) => {
	response.json({ "messages": [ { "text": "Hello from Firebase!" } ]
});

const questions = [
	"Do you take initiatives?",
	"Do you take care of people?",
	"Do you prefer to be alone?",
	"Do you prefer to listen than to talk?",
	"Do you feel rarely tired?"
]

exports.sixfactorsGetNextQuestion = functions.https.onRequest((request, response) => {

  console.log("sixfactorsGetNextQuestion : " + JSON.stringify(request.query) );
  
  // Grab the questionId parameter.
  const questionId = request.query["questionId"];
  // Parse the parameter as an integer
  var questionIndex = parseInt(questionId, 10);

  // Set 0 if it is not a number or increment the question index
  if( isNaN(questionIndex) ) {
  	questionIndex = 0;
  } else {
  	questionIndex++;
  }


  if( questionIndex >= 0 && questionIndex < questions.length ) {

  	response.json( {
		"set_attributes": 
		{
			"isComplete": false,
			"questionId": questionIndex,
			"questionText": questions[ questionIndex ],
		}
	});

  } else {

  	response.json( {
		"set_attributes": 
		{
			"isComplete": true,
			"questionId": questions.length,
			"questionText": "",
		}
	});

  }
 
  
});