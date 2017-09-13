const functions = require('firebase-functions');

const admin = require('firebase-admin');

admin.initializeApp(functions.config().firebase);

/*
Load the sixfactors metadata
*/
const sixfactors = require('./data/sixfactors');

/*
List the supported languages
*/
const SUPPORTED_LANGS = [ "en", "fr" ];

/*
Set english as the default language.
*/
const DEFAULT_LANG = "en";

/*
Get the injected API key
*/
const API_KEY = functions.config().sixfactors.apikey

/*
	Get the next 6 factors question given the previous question id
	params:
	 - "chat user id"   : the user id in Chatfuel
	 - "questionId"   : the previous question id
	 - "locale"       : the current user language
*/
exports.sixfactorsGetNextQuestion = functions.https.onRequest((request, response) => {

  console.log("sixfactorsGetNextQuestion : " + JSON.stringify(request.query) );

  if( !checkApiKey(request) ) {
  	badRequest(response, "The API key is not valid.");
  	return;
  }
  
  // Grab the chatfuel user ID parameter.
  const userId = request.query["chatfuel user id"];
  // Grab the questionId parameter.
  const lastQuestionId = request.query["questionId"];
  // Grab the locale parameter.
  const locale = request.query["locale"];

  if( !verifyParam(userId) ) {
  	badRequest(response, "Unable to find the user id.");
  	return;
  }

  if( !verifyParam(locale) ) {
  	badRequest(response, "Unable to find the user locale.");
  	return;
  }

  const lang = getLang(locale);

  // CALLBACKS : Create callbacks function to chain into a promise.
  const __retrieveLastQuestionId = (userId) => {

  	console.log("__retrieveLastQuestionId: userId = " + userId );

  	const lastQuestionRef = admin.database().ref('/sixfactors/answers').child(userId).child("lastQuestionId");

  	return lastQuestionRef.once("value")
  	.then( (dataSnapshot) => {

  		if( !dataSnapshot.exists() ) {
  			return -1;
  		}

  		return dataSnapshot.val();

  	} );
  }

  const __incrementQuestionId = (lastQuestionId) => {

  	console.log("__incrementQuestionId: lastQuestionId = " + lastQuestionId );

  	return lastQuestionId + 1;
  }

  const __endOfTest = (reason) => {

  	console.log("__endOfTest: reason = " + reason);

  	return {
  			"isComplete": true,
  			"id": -1,
  			"label": ""
  		}
  };

  const __fetchQuestion = (questionId) => {

  	console.log("__fetchQuestion: questionId = " + questionId );

  	const question = sixfactors.questions[questionId];

  	if( question === undefined ) {
  		return __endOfTest("The question " + questionId + " doesn't exist.")
  	}

  	var questionLabel = question.label[lang];

  	if( questionLabel === undefined ) {
  		questionLabel = question.label[DEFAULT_LANG];
  	}
  	
  	return {
		"isComplete": false,
		"id": questionId,
		"label": questionLabel
	};
  }

  const __createResponse = (question) => {

  	console.log("__createResponse: " + JSON.stringify(question) );

  	response.json( {
		"set_attributes": 
		{
			"isComplete": question.isComplete,
			"questionId": question.id,
			"questionText": question.label,
		}
	});

  }
  // END CALLBACKS
  

  // Get the last question id for this user if the parameter is not valid
  const lastQuestionIndex = parseInt(lastQuestionId, 10);
  var promise;

  if( isNaN(lastQuestionIndex) ) {
  	promise = __retrieveLastQuestionId(userId)
  } else {
  	promise = new Promise( (resolve, reject) => {
  		resolve(lastQuestionIndex);
  	} );
  }

  promise
  	.then(__incrementQuestionId)
	.then(__fetchQuestion).catch(__endOfTest)
	.then(__createResponse);
  
});

/*
	Save the user answer of a given question
	params:
	 - "chat user id"   : the user id in Chatfuel
	 - "locale"         : the current user's locale
	 - "questionId"     : the ID of the question
	 - "userAnswer"     : the user answer (localized text)
*/
exports.sixfactorsSaveAnswer = functions.https.onRequest((request, response) => {


  console.log("sixfactorsSaveAnswer : " + JSON.stringify(request.body) );

  if( !checkApiKey(request) ) {
  	badRequest(response, "The API key is not valid.");
  	return;
  }
  
  // Grab the chatfuel user ID parameter.
  const userId     = request.body["chatfuel user id"];
  // Grab the current user locale
  const locale     = request.body["locale"];
  // Grab the question ID parameter.
  const questionId = request.body["questionId"];
  // Grab the user answer parameter.
  const userAnswer = request.body["userAnswer"];

  if( !verifyParam(userId) ) {
  	badRequest(response, "Unable to find the user id.");
  	return;
  }

  if( !verifyParam(locale) ) {
  	badRequest(response, "Unable to find the user locale.");
  	return;
  }

  if( !verifyParam(questionId) ) {
  	badRequest(response, "Unable to find the question ID.");
  	return;
  }

  if( !verifyParam(userAnswer) ) {
  	badRequest(response, "Unable to find the user answer.");
  	return;
  }

  const lang = getLang(locale);

  const answerCode = getAnswerCode(lang, userAnswer);

  var answer = {};
  answer["lastQuestionId"] = parseInt(questionId, 10);
  answer[questionId] = answerCode;

  const userAnswersRef = admin.database().ref('/sixfactors/answers').child(userId);

  userAnswersRef.update(answer)
  .then(function() {
	response.end();
  });
	
});

/*
	Compute the result of the test for a given user.
	params:
	 - "chat user id"   : the user id in Chatfuel
	 - "locale"         : the current user's locale
*/
exports.sixfactorsComputeTestResult = functions.https.onRequest((request, response) => {


  console.log("sixfactorsComputeTestResult : " + JSON.stringify(request.query) );

  if( !checkApiKey(request) ) {
  	badRequest(response, "The API key is not valid.");
  	return;
  }
  
  // Grab the chatfuel user ID parameter.
  const userId     = request.query["chatfuel user id"];
  // Grab the current user locale
  const locale     = request.query["locale"];

  if( !verifyParam(userId) ) {
  	badRequest(response, "Unable to find the user id.");
  	return;
  }

  if( !verifyParam(locale) ) {
  	badRequest(response, "Unable to find the user locale.");
  	return;
  }

  const lang = getLang(locale);

  // CALLBACKS
  const __fetchAnswers = (userId) => {

  	console.log("Fetch the answers for the userId : " + userId);

  	const userAnswersRef = admin.database().ref('/sixfactors/answers').child(userId);

  	return userAnswersRef.once('value')
  	.then( (dataSnapshot ) => {

  		console.log("Fetching successed.");

  		if( !dataSnapshot.exists() ) {
  			return {};
  		}

  		var answers = dataSnapshot.val();

  		delete answers.lastQuestionId;

  		return answers;

  	});
  };

  const __doProjectionOnAxis = ( answers ) => {

  	console.log("Projects the answers on axis : " + JSON.stringify( answers ) );

  	var axis = {
  		"casualness":   0,
  		"toughness":    0,
  		"independence": 0,
  		"controlling":  0,
  		"energy":       0,
  		"creativity":   0,
  	};

  	for (var questionId in answers) {
	    if (answers.hasOwnProperty(questionId)) {
	        
	    	var answerCode = answers[questionId];
	    	var question   = sixfactors.questions[questionId];
	    	var range      = question.matches.range;

	    	if( answerCode >= range[0] && answerCode <= range[1] ) {
	    		axis[question.matches.dimension]++;
	    	}

	    }
	}

	return axis;

  };

  const __doTestResultAnalysis = ( axis ) => {

  	console.log("Perform the analysis of the projection : " + JSON.stringify( axis ) );

  	const __getAnalysis = (domain, dimension, score) => {

  		console.log("Get analysis for domain : " + domain + ", dimension : " + dimension + ", score : " + score );

  		const levels = sixfactors.analysis[domain].dimensions[dimension].levels;

  		for( let level of levels ) {

  			console.log("...checking level : " + JSON.stringify( level ) );

  			if( score >= level.range[0] && score <= level.range[1] ) {
  				return level;
  			}

  		}

  		return levels[0];

  	};

  	return {
  		"axis": axis,
  		"organization": {
			"casualness": __getAnalysis("organization", "casualness", axis["casualness"] ),
			"toughness":  __getAnalysis("organization", "toughness", axis["toughness"] )
		},
		"interaction": {
			"independence": __getAnalysis("interaction", "independence", axis["independence"] ),
			"controlling":  __getAnalysis("interaction", "controlling", axis["controlling"] )
		},
		"enthusiasm": {
			"energy":     __getAnalysis("enthusiasm", "energy", axis["energy"] ),
			"creativity": __getAnalysis("enthusiasm", "creativity", axis["creativity"] )
		}
  	};

  }

  const __createResponse = ( analysis ) => {

	console.log("Create the HTTP response for the analysis : " + JSON.stringify( analysis ) );

	response.json( {
		"set_attributes": 
		{
			"orgCasualnessDesc":    analysis["organization"]["casualness"].description[lang],
			"orgToughnessDesc":     analysis["organization"]["toughness"].description[lang],
			"intIndependenceDesc":  analysis["interaction"]["independence"].description[lang],
			"intControllingDesc":   analysis["interaction"]["controlling"].description[lang],
			"entEnergyDesc":        analysis["enthusiasm"]["energy"].description[lang],
			"entCreativityDesc":    analysis["enthusiasm"]["creativity"].description[lang],
		}
	} ); 

  };

  //END OF CALLBACKS

  __fetchAnswers( userId )
  .then( __doProjectionOnAxis )
  .then( __doTestResultAnalysis )
  .then( __createResponse );
	
});

/*
	Get answer code from the answer localized text.
	params:
	 - lang : the current user language
	 - userAnswer : the user answer 
*/
function getAnswerCode(lang, userAnswer) {

	var codeMap = sixfactors.answerCodes[lang];

	if( codeMap === undefined || codeMap === null ) {
		codeMap = sixfactors.answerCodes[lang];
	}

	return codeMap[userAnswer];

}

/*
	Verify the value of a query parameter.
	Returns true if the value is correct, false otherwise
	params:
	 - value        : the param value (string)
*/
function verifyParam(value) {

  if( value === undefined || value === null || value.length === 0 ) {
  	return false;
  }

  return true;

}

/*
	Send a bad request status with a message.
	params:
	 - response     : the response to the HTTP request
	 - message : the message to return if the request is not valid
*/
function badRequest(response, message) {

	console.log(message);

	response.status(400).json({ "messages": [ { "text": message } ] });

}

/*
	Get the language from the user locale.
	params:
	 - locale : the current user locale 
*/
function getLang(locale) {

	const lang = locale.substring(0, 2);

	if( SUPPORTED_LANGS.indexOf(lang) === -1 ) {
		return DEFAULT_LANG;
	}

	return lang;

}

/*
	Check the API key
*/
function checkApiKey(request) {

	let apiKey = request.query.apikey;
	
	if ( apiKey === undefined ) {
		apiKey = request.body.apikey;
	}

	return (API_KEY === apiKey);

}