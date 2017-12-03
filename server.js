"use strict";

//all config params
const config = require("./config.json");
const PAGE_ACCESS_TOKEN = config.page_access_token;
const APIAI_TOKEN = config.api_ai_token;
const FB_VALIDATION_TOKEN = config.fb_validation_token;
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const promise = require("promise");
const apiai = require("apiai");
const moment = require("moment-timezone");
const qb_client_id = config.clientId;
const qb_url = config.api_uri + config.realmId;
const app = express();
const apiaiApp = apiai(APIAI_TOKEN);

app.set("port", process.env.PORT || 5000);
let currentTime = moment();
let estTimeStamp = moment.tz(currentTime, "America/Toronto").format();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

//Server start
const server = app.listen(process.env.PORT || 5000, () => {
  console.log(
    "Express server listening on port %d in %s mode",
    server.address().port,
    app.settings.env + "-" + estTimeStamp
  );
});

/*just static home page */
app.get("/", (req, res) => {
  console.log("Time Stamp :" + estTimeStamp);
  res.send("Home Page");
});

/* For Facebook Validation */
app.get("/webhook", function(req, res) {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === FB_VALIDATION_TOKEN
  ) {
    console.log("[app.get] Validating webhook");
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

/* handle fb webhook incoming messages */
app.post("/webhook", function(req, res) {
  // You must send back a status 200 to let the Messenger Platform know that you've
  // received the callback. Do that right away because the countdown doesn't stop when
  // you're paused on a breakpoint! Otherwise, the request might time out.
  res.sendStatus(200);

  //req body from fb
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object == "page") {
    // entries may be batched so iterate over each one
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // iterate over each messaging event
      pageEntry.messaging.forEach(function(messagingEvent) {
        let propertyNames = [];
        for (var prop in messagingEvent) {
          propertyNames.push(prop);
        }
        console.log(
          "[app.post] Webhook received a messagingEvent with properties:\n ",
          +propertyNames.join()
        );

        if (messagingEvent.message) {
          // someone sent a message
          receivedMessage(messagingEvent);
        } else if (messagingEvent.delivery) {
          // messenger platform sent a delivery confirmation
          receivedDeliveryConfirmation(messagingEvent);
        } else if (messagingEvent.postback) {
          // user replied by tapping one of our postback buttons
          receivedPostback(messagingEvent);
        } else {
          console.log(
            "[app.post] Webhook is not prepared to handle this message."
          );
        }
      });
    });
  }
});

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload;

  console.log(
    "[receivedPostback] from user (%d) on page (%d) with payload ('%s') " +
      "at (%d)",
    senderID,
    recipientID,
    payload,
    timeOfPostback
  );

  processPayLoad(senderID, payload);
}

function receivedDeliveryConfirmation(event) {
  var senderID = event.sender.id; // the user who sent the message
  var recipientID = event.recipient.id; // the page they sent it from
  var delivery = event.delivery;
  var messageIDs = delivery.mids;
  var watermark = delivery.watermark;
  var sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach(function(messageID) {
      console.log(
        "[receivedDeliveryConfirmation] Message with ID %s was delivered",
        messageID
      );
    });
  }
  console.log(
    "[receivedDeliveryConfirmation] All messages before timestamp %d were delivered.",
    watermark
  );
}

/* Received message from FB-> send it to api.ai to get action -> GET query from API.ai for the text */

function receivedMessage(event) {
  console.log(JSON.stringify(event));
  let sender = event.sender.id;
  let text = event.message.text;
  let receivedMessage = event.message;

  if (
    receivedMessage.attachments &&
    receivedMessage.attachments[0].payload.url
  ) {
    let attachedImgURL = receivedMessage.attachments[0].payload.url;
    console.log("Received image message : %s" + attachedImgURL);

    //attachment
  } else {
    let apiaiSession = apiaiApp.textRequest(text, { sessionId: sender });

    apiaiSession.on("response", response => {
      console.log(JSON.stringify(response));
      let aiTextAction = response.result.action;
      let aiTextResponse = response.result.fulfillment.speech;
      let aiParameters = response.result.parameters
      console.log("Returned from NLP API AI-->" + aiTextAction);
      console.log("Returned from NLP API AI-aiParameters->" + aiParameters);
      
      switch (aiTextAction) {
        case "input.welcome":
          // sendLoginButton(sender);
          sendWelcomeButton(sender);
          break;

        case "estimate":
          
          get_Estimate(sender,aiParameters);
          break;
        case "expense":
          console.log("Expense called");
          getVendorExpenses(sender);
          break;          
        case "profitloss":
          getProfitLoss(sender);
          break;
        default:
          console.log(
            "\n\nswitch to prepareSendTextMessage Time Stamp :" +
              estTimeStamp +
              "\n"
          );

          break;
      }
    });

    apiaiSession.on("error", error => {
      console.log(error);
    });

    apiaiSession.end();
  }
}

//pass array of template button templateElements /generic
function sendLoginButton(recipientId, templateElements) {
  console.log(
    "[sendHelpOptionsAsButtonTemplates] Sending the help options menu"
  );

  var templateElements = [];

  var oAuth_QBurl =
    "https://appcenter.intuit.com/connect/oauth2?client_id=" + qb_client_id;

  templateElements.push({
    title: "Login to Your Quickbooks",
    buttons: [
      {
        type: "account_link",
        url: oAuth_QBurl
      }
    ]
  });

  sendButtonMessages(recipientId, templateElements);
}

/*format as buttons*/
function sectionButton(title, action, options) {
  var payload = options | {};
  payload = Object.assign(options, { action: action });
  return {
    type: "postback",
    title: title,
    payload: JSON.stringify(payload)
  };
}

function sendButtonMessages(recipientId, templateElements) {
  console.log("[sendButtonMessages] Sending the buttons "+templateElements);

  // var sectionButton = function(title, action, options) {
  //   var payload = options | {};
  //   payload = Object.assign(options, { action: action });
  //   return {
  //     type: "postback",
  //     title: title,
  //     payload: JSON.stringify(payload)
  //   };
  // };

  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: templateElements
        }
      }
    }
  };

  sendMessagetoFB(messageData);
}


function sendWelcomeButton(recipientId) {
  var templateElements = [];

  templateElements.push({
    title: "Get My Company Info",
    buttons: [sectionButton("Company Name", "Company_Info", {})]
  });

  templateElements.push({
    title: "What you like to do today",
    buttons: [
      sectionButton("Send Invoice", "Get_Invoice", {}),
      sectionButton("Create Invoice", "Get_Quote", {})
    ]
  });

  sendButtonMessages(recipientId, templateElements);

  // });
}

function sendProductsOptionsAsButtonTemplates(
  recipientId,
  products,
  searchTag
) {
  console.log(
    "[sendHelpOptionsAsButtonTemplates] Sending the help options menu"
  );

  var sectionButton = function(title, action, options) {
    var payload = options | {};
    payload = Object.assign(options, { action: action });
    return {
      type: "postback",
      title: title,
      payload: JSON.stringify(payload)
    };
  };
  var templateElements = [];
  products.forEach(function(product) {
    var url = HOST_URL + "products/" + product.handle;
    // console.log("Product url -\n" + url);

    templateElements.push({
      title: product.title,
      subtitle: product.tags,
      image_url: product.image.src,
      buttons: [
        {
          type: "web_url",
          url: url,
          title: "Read description"
          // webview_height_ratio: "compact",
          // messenger_extensions: "true"
        },
        sectionButton(
          "Check avaliable Sizes and colors",
          "QR_GET_PRODUCT_OPTIONS",
          {
            id: product.id
          }
        ),
        sectionButton("Check Price", "QR_GET_PRODUCT_PRICE", {
          id: product.id
        })
      ]
    });
  });
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: templateElements
        }
      }
    }
  };

  sendMessagetoFB(messageData);
  // });
}

function processPayLoad(recipientId, requestForHelpOnFeature) {
  var templateElements = [];
  var requestPayload = JSON.parse(requestForHelpOnFeature);
  var sectionButton = function(title, action, options) {
    var payload = options | {};
    payload = Object.assign(options, { action: action });
    return {
      type: "postback",
      title: title,
      payload: JSON.stringify(payload)
    };
  };

  var textButton = function(title, action, options) {
    var payload = options | {};
    payload = Object.assign(options, { action: action });
    return {
      content_type: "text",
      title: title,
      payload: JSON.stringify(payload)
    };
  };
  let payloadAction = requestPayload.action;
  console.log("requestPayload.action--" + payloadAction);
  switch (payloadAction) {
    case "Company_Info":
      send_CompanyInfo(recipientId);

      break;

    case "Send_Invoice":
      var options = "";
      var variants = "Trying to query QB API";

      var variants = "Creating Invoice";
      prepareTextMessage(recipientId, variants, "");

      break;

    case "Create_Invoice":
      var variants = "Creating Invoice";
      prepareTextMessage(recipientId, variants, "");

      // });
      break;

    

    default:
    // code to be executed if n is different from first 2 cases.
  }
}

function prepareTextMessage(recipientId, variants, options) {
  console.log("prepareTextMessage :-" + variants);
  
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: variants
    }
  };
  console.log("prepareTextMessage :-" + "messageData");
  
  sendMessagetoFB(messageData);
}

function sendMessagetoFB(messageData) {

  
  console.log("Send Message method :-" + JSON.stringify(messageData));
  request(
    {
      url: "https://graph.facebook.com/v2.6/me/messages",
      qs: { access_token: PAGE_ACCESS_TOKEN },
      method: "POST",
      json: messageData
    },
    (error, response) => {
      if (error) {
        console.log("Error sending message: ", error);
      } else if (response.body.error) {
        console.log("Error: in send message ", response.body.error);
      }
    }
  );
}

function prepareSendTextMessage(sender, aiText) {
  let messageData = { recipient: { id: sender }, message: { text: aiText } };
  sendMessagetoFB(messageData);
}

function send_CompanyInfo(recipientId) {  
  call_QB_API("/companyinfo/" + config.realmId, "GET", true).then(
    function(data) {
      console.log("data--"+JSON.stringify(data));
      var variants = data.CompanyInfo.CompanyName;      
      prepareTextMessage(recipientId, variants, "");
    },
    function(err) {
      console.error("%s; %s", err.message, url);
      console.log("%j", err.res.statusCode);
    }
  );
}

let exp_vend_list = []
function getVendorExpenses(recipientId) {
  call_QB_API("/reports/VendorExpenses","GET",true).then(
    function(data) {
      console.log(JSON.stringify(data));
      var total = 0;
      data.Rows.Row.forEach(function (cols){

        if(Object.keys(cols).includes('ColData')){
          var vendorlist = {
            vendor:cols.ColData[0].value,
            expense:cols.ColData[1].value
          }
          console.log("COLS:"+cols.ColData[1].value);
          total =  parseFloat(total) + parseFloat(cols.ColData[1].value);
          console.log("TOTAL"+total.toFixed(2));
          
          exp_vend_list.push(vendorlist);  
        }
        
      });
      prepareTextMessage(recipientId, "Total Expense:" + total.toFixed(2),"");

      var format = "Top 5 Expenses by Vendors:\n";
      console.log(exp_vend_list.sort(predicateBy("expense")));
      exp_vend_list = exp_vend_list.sort(predicateBy("expense"));
      var i=0
      exp_vend_list.forEach(function(val){
        if(parseFloat(val.expense) > 500 && i <5)
          format = format + val.expense +"\t-\t"+val.vendor + "\n";
          i++;
      });
      prepareTextMessage(recipientId, format  , "");
      
    },
    function(err) {

    }
    
  )
}
function predicateBy(prop){
  return function(a,b){
     return parseFloat(b[prop]) - parseFloat(a[prop]);
  }
}
function getProfitLoss(recipientId) {
  call_QB_API("/reports/ProfitAndLoss","GET",true).then(
    function(data) {
      var build="PROFIT AND LOSS \n";
      data.Rows.Row.forEach(function (cols){
        if(!Object.keys(cols).includes('ColData')) {
          if(cols.Summary.ColData[0].value == "Total Income") {
            build += "\nTOTAL INCOME:\t\t"+ cols.Summary.ColData[1].value;
          }

          if(cols.Summary.ColData[0].value == "Gross Profit") {
            build += "\nGROSS PROFIT:\t\t"+ cols.Summary.ColData[1].value;
          }
          if(cols.Summary.ColData[0].value == "Total Expenses") {
            build += "\n--------------------------------------"
            build += "\nTotal Expenses:\t\t"+ cols.Summary.ColData[1].value;
          }
          if(cols.Summary.ColData[0].value == "Net Operating Income") {
            build += "\n--------------------------------------"
            build += "\nNet Operating Income:\t"+ cols.Summary.ColData[1].value;
          }
          if(cols.Summary.ColData[0].value == "Total Other Expenses") {
            build += "\nOther Expenses:\t\t"+ cols.Summary.ColData[1].value;
          }
          // if(cols.Summary.ColData[0].value == "Total Other Expenses") {
          //   format += "\nTotal Other Expenses:\t"+ cols.Summary.ColData[1].value;
          // }
          if(cols.Summary.ColData[0].value == "Net Income") {
            build += "\n--------------------------------------"
            build += "\nNet Income:\t\t\t"+ cols.Summary.ColData[1].value;
          }
        }
      });
      prepareTextMessage(recipientId, build  , "");
      

    },
    function(err) {
      console.log(err);
      
    }
    
  )
}

function call_QB_API(endPoint, method, json) {
  var qb_url_endppoint = qb_url + endPoint;
  console.log(qb_url_endppoint);
  json = json || false;
  var requestObj = {
    url: qb_url_endppoint,
    headers: {
      method: method,
      Authorization: "Bearer " + config.qb_access_token,
      Accept: "application/json"
    }
  };
  return new promise(function(resolve, reject) {
    request(requestObj, function(err, response, body) {
      if (err || response.statusCode !== 200) {

        console.log("api call error-\n-"+err);
        
        return reject(err);
      }
      console.log("api call sucess-\n-");
      
      resolve(JSON.parse(body));
    });
  });
}

function send_CompanyInfo(recipientId) {
  call_QB_API("/companyinfo/" + config.realmId, "GET", true).then(
    function(data) {
      console.log("data--"+JSON.stringify(data));
      var variants = data.CompanyInfo.CompanyName;
      prepareTextMessage(recipientId, variants, "");
    },
    function(err) {
      console.error("%s; %s", err.message, url);
      console.log("%j", err.res.statusCode);
    }
  );
}

function get_Estimate(recipientId,aiParameters){
 //https://sandbox-quickbooks.api.intuit.com/v3/company/123145927165634/query?query=SELECT%20%2A%20FROM%20Estimate%20WHERE%20TxnStatus%3D%20%27Pending%27&minorversion=4
 console.log("get_Estimate--");
 var templateElements = [];
 var params =  ''
  call_QB_API("/query?query=SELECT * FROM Estimate", "GET", true).then(
    function(data) {
      var variants=''
      // console.log("get_Estimate--"+JSON.stringify(data));      
      data.QueryResponse.Estimate.forEach(function(item){
        
        if(item.TxnStatus=='Pending'||item.TxnStatus=='Open'){
        console.log('TxnStatus: ' + JSON.stringify(item.TxnStatus));
        console.log('CustomerRef: ' + JSON.stringify(item.CustomerRef.value));  
        // variants = "estimating.."+item.CustomerRef.value;      

        templateElements.push({
          title: "Customer Name : "+item.CustomerRef.name,
          subtitle: "Description : " +item.Line[0].Description +" " +" Total :" +item.TotalAmt +'\n Estimate Status : '+item.TxnStatus,
          buttons: [
            sectionButton(
              "Get Invoice Details",
              "Customer_Invoice_Details",
              {
                id: item.CustomerRef.value,
                eid: item.Id
                
              }
            ),
            sectionButton("Create Invoice", "Create_Invoice", {
              cid: item.CustomerRef.value,
              c_amount: item.TotalAmt,
              eid: item.Id
            })
          ]
        });
        }  
      });
      // prepareTextMessage(recipientId, variants, " ");
      //      
        sendButtonMessages(recipientId, templateElements);
      ///
    },
    function(err) {
      console.error("%s; %s", err.message, url);
      console.log("%j", err.res.statusCode);
      prepareTextMessage(recipientId, "error occured", " ");      
    }
  );


  
}

// /* Webhook for API.ai to get response from the 3rd party API */
// app.post("/ai", (req, res) => {
//   var templateElements = [];
//   switch (req.body.result.action) {
//     case "shipping":
//       console.log("\n\n*** Shipping *** Time Stamp :" + estTimeStamp + "\n");
//       let address = req.body.result.parameters["geo-country"];

//       break;

//     case "search":
//       console.log("\n case - search");
//       let msg = "Converted Text to JSON";
//       return res.json({
//         speech: msg,
//         displayText: msg,
//         source: "search"
//       });
//       break;

//     default:
//     // code to be executed if n is different from first 2 cases.
//   }
// });


function refresh_QB_API(Time) {
  console.log("Refresh and update the file Message method :-");
  request(
    {
      Accept: application/json,
      Authorization: "Basic "+config.qb_access_token,
      "Content-Type": "application/x-www-form-urlencoded",
      Host: "oauth.platform.intuit.com",
      "Cache-Control": "no-cache",
      Body: "grant_type=refresh_token& refresh_token="+config.qb_refresh_token
  
    },
    (error, response) => {
      if (error) {
        console.log("Error sending message: ", error);
      } else if (response) {
        console.log("Error: in send message ", JSON.stringify(response.body));
        //TODO -- make a better way to update the token on fly
        config.qb_access_token = JSON.parse(response.body).access_token;
      }
    }
  );
}