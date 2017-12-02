"use strict";
const PAGE_ACCESS_TOKEN =
  "EAAY1hEccGycBAI1KXejoUWKeXmZBjMvD38RjJZAGFzxMvyAAhZBZBoUZAwGfNM9conxwQhRYiUF4EXFcX03nsUn1N6XHJIARA08nDwmTf4pKwWHqDUvCySanTrROaWgKpbxOPO2QKEsowNQ18ttn9vMp3RoLpm4wn24kEmZCbZCbAZDZD";
const APIAI_TOKEN = "8ab4f1896fb047ea95af3fbf24ccfb72";
const FB_VALIDATION_TOKEN = "smallbizTo";
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const apiai = require("apiai");
const moment = require("moment-timezone");
var config = require('./config.json')



const app = express();
app.set("port", process.env.PORT || 5000);
let currentTime = moment();
let estTimeStamp = moment.tz(currentTime, "America/Toronto").format();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const server = app.listen(process.env.PORT || 5000, () => {
  console.log(
    "Express server listening on port %d in %s mode",
    server.address().port,
    app.settings.env + "-" + estTimeStamp
  );
});

const apiaiApp = apiai(APIAI_TOKEN);

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

app.post("/webhook", function(req, res) {
  // You must send back a status 200 to let the Messenger Platform know that you've
  // received the callback. Do that right away because the countdown doesn't stop when
  // you're paused on a breakpoint! Otherwise, the request might time out.
  res.sendStatus(200);

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

  sendButtonMessages(senderID, payload);
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

  if (receivedMessage.attachments && receivedMessage.attachments[0].payload.url) {
    let attachedImgURL = receivedMessage.attachments[0].payload.url;
    console.log("Received image message : %s" + attachedImgURL);

    //attachment
  } else {
    let apiaiSession = apiaiApp.textRequest(text, { sessionId: sender });

    apiaiSession.on("response", response => {
      console.log(JSON.stringify(response));
      let aiTextAction = response.result.action;
      let aiTextResponse = response.result.fulfillment.speech;

      console.log(
        "\n****************************processing event****************************\n"
      );
      console.log("aiTextAction-->" + aiTextAction);

      switch (aiTextAction) {
        case "case1":
          console.log(
            "\n\nswitch to Time Stamp :" + estTimeStamp + "\n"
          );
          break;

        case "input.welcome":
          
        sendLoginButton(sender);
       // sendWelcomeButton(sender);



        break;
        case "search":

        //write whatever shit we want
          if (
            response.result.parameters["userSearchText"] ||
            response.result.parameters["recommandType"]
          ) {

          } else {
            let errorMessage = "please narrow down your search.";
            prepareSendTextMessage(sender, errorMessage);

            //ask users something to search
          }

          break;

        default:
          console.log(
            "\n\nswitch to prepareSendTextMessage Time Stamp :" +
              estTimeStamp +
              "\n"
          );
          prepareSendTextMessage(sender, aiTextResponse);
      }
    });

    apiaiSession.on("error", error => {
      console.log(error);
    });

    apiaiSession.end();
  }
}
function sendLoginButton(recipientId){

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

    templateElements.push({
      title: "Login to Your Quickbooks",
      buttons:[
        {
          "type": "account_link",
          "url": "https://www.example.com/authorize"
        }
      ]
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
}


function sendWelcomeButton(recipientId){

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

    templateElements.push({
      title: "What you like to do today",
      buttons: [
        sectionButton("Send Invoice", "Send_Invoice", {          
        }),
        sectionButton("Create Invoice", "Create_Invoice", {
        })
      ]
    });

    templateElements.push({
      title: "What you like to do today",
      buttons: [
        sectionButton("Send Invoice", "Get_Invoice", {          
        }),
        sectionButton("Create Invoice", "Get_Quote", {
        })
      ]
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


function sendProductsOptionsAsButtonTemplates(recipientId, products,searchTag) {
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
          title: "Read description",
          // webview_height_ratio: "compact",
          // messenger_extensions: "true"
        },
        sectionButton("Check avaliable Sizes and colors", "QR_GET_PRODUCT_OPTIONS", {
          id: product.id
        }),
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


function sendButtonMessages(recipientId, requestForHelpOnFeature) {
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
  let payloadAction = requestPayload.action
  console.log("requestPayload.action" + payloadAction);
  switch (payloadAction) {


  case "Send_Invoice":
  // var sh_product = shopify.product.get(requestPayload.id);
  // sh_product.then(function(product) {
    var options = "";
    var variants = "Trying to query QB API";

    var messageData = {
      recipient: {
        id: recipientId
      },
      message: {
        text: variants.substring(0, 640)

      }
    };
    sendMessagetoFB(messageData);
  // });

  break;

  case "Create_Invoice":
  // var sh_product = shopify.product.get(requestPayload.id);
  // sh_product.then(function(product) {
    var options = "";
    var variants = "Creating Invoice";

    var messageData = {
      recipient: {
        id: recipientId
      },
      message: {
        text: variants.substring(0, 640)

      }
    };
    sendMessagetoFB(messageData);
  // });
      break;

      default:
      // code to be executed if n is different from first 2 cases.
  }
}

function sendMessagetoFB(messageData) {
  console.log("Send Message method :-" + messageData);
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

/* Webhook for API.ai to get response from the 3rd party API */
app.post("/ai", (req, res) => {
  var templateElements = [];
  switch (req.body.result.action) {
      
    case "shipping":
      console.log("\n\n*** Shipping *** Time Stamp :" + estTimeStamp + "\n");
      let address = req.body.result.parameters["geo-country"];


      break;

    case "search":
      console.log("\n case - search");
      let msg = "Converted Text to JSON";
      return res.json({
        speech: msg,
        displayText: msg,
        source: "search"
      });
      break;

    default:
    // code to be executed if n is different from first 2 cases.
  }
});