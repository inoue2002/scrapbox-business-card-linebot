//LINEBotのソースコード
const LINE_CHANNEL_TOKEN = "";
//GCPのAPIKEY
const GOOGLE_API_KEY = ""
//GyazoのAPIKEY
const GYAZO_API_KEY = ""
//Scrapboxのuidを記入
const sid = ""
//Scrapboxのプロジェクト名(https://scrapbox.io/:projectName)
const projectName = ""
//LINEのユーザーIDを記入
const LINE_USER_ID =[""]

const logSheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet()

/**
 * LINEBotリクエスト受付
 * @param {e} e - e 
 * 参考文献　https://qiita.com/yun_bow/items/829fc67629b1d81a6406
 */
async function doPost(e) {
  for (let i = 0; i < JSON.parse(e.postData.contents).events.length; i++) {
    const event = JSON.parse(e.postData.contents).events[i];
    let check = false
    for(const userId of LINE_USER_ID){
      if(event.source.userId === userId){
        check = true
      }
    }
    if(!check){
       loglogSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), '無効なユーザーからのリクエスト', event.source.userId])
       return 
    }
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), 'ユーザーからイベント受付', event])
    const message = await eventHandle(event);
    //応答するメッセージがあった場合
    if (message !== undefined) {
      try {
        const res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            Authorization: "Bearer " + LINE_CHANNEL_TOKEN,
          },
          method: "post",
          payload: JSON.stringify({
            replyToken: event.replyToken,
            messages: [message],
          }),
        });
        if (res.getResponseCode() === 200) {
          logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), 'メッセージ送信完了', message])
        } else {
          logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), 'メッセージ送信に失敗しました', message])
        }
      } catch (e) {
        logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), 'メッセージの送信でエラー発生', e])
      }
    }
  }
  return ContentService.createTextOutput(
    JSON.stringify({ content: "post ok" })
  ).setMimeType(ContentService.MimeType.JSON);
}

async function eventHandle(event) {
  let message;
  switch (event.type) {
    case "message":
      message = await messagefunc(event);
      break;
    case "postback":
      message = await postbackFunc(event);
      break;
    case "follow":
      message = await followFunc(event);
      break;
    case "unfollow":
      message = unfolowFunc(event);
      break;
  }
  return message;
}
//メッセージイベントの処理
async function messagefunc(event) {
  if (event.message.type === 'image') {
    const content = getLineContent(event.message.id)
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), 'コンテンツ取得完了', event.message.id])
    const allText = getAnnotate(content)
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), '全文取得完了', allText[0].fullTextAnnotation.text])
    const imageUrl = uploadGyazo(content)
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), '画像アップロード完了', imageUrl])
    const enti = retrieveSentiment(allText[0].fullTextAnnotation.text)
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), '抽出完了', enti])
    const exportRes = exportPages(enti, imageUrl, allText[0].fullTextAnnotation.text)
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), 'すくぼ書き込み完了', exportRes])
    return { type: "text", text: `自動取り込みを行いました` };
  } else {
    return { type: "text", text: event.message.text };
  }

}
//ポストバックイベントの処理
async function postbackFunc(event) {
  return { type: "text", text: event.postback.data };
}
//友達登録時の処理
async function followFunc(event) {
  return { type: "text", text: "友達登録ありがとうございます!!" };
}
//友達解除後の処理
async function unfollowFunc() {
  return undefined;
}

/**
 * Googleに画像を送信する
 * @param {Object} file ファイル
 */
function getAnnotate(file) {
  try {
    let url = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`;
    let options = {
      'method': 'get',
      'headers': {
        'Content-Type': 'application/json; charset=UTF-8',
      },
      'payload': JSON.stringify({
        requests: [{
          image: {
            content: Utilities.base64Encode(file.getBlob().getBytes())
          },
          features: [{
            type: 'WEB_DETECTION', // WEBの検出
            maxResults: 5
          },
          {
            type: 'LABEL_DETECTION', // ラベルの検出
            maxResults: 5
          },
          {
            type: 'TEXT_DETECTION', // 文字の検出
            maxResults: 5
          },
          {
            type: 'LANDMARK_DETECTION', // 場所の検出
            maxResults: 5
          },
          {
            type: 'LOGO_DETECTION', // ロゴ検出
            maxResults: 5
          },
          ],
        }]
      })
    };
    let response = UrlFetchApp.fetch(url, options);
    return JSON.parse(response.getContentText('UTF-8')).responses;
  } catch (e) {
    console.log('エラー', e)
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), '文言検出エラー', e.getContentText])
  }
}

/**
 * LINEからコンテンツを取得する
 * @param {String} messageId メッセージID
 */
function getLineContent(messageId) {
  try {
    const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`
    let options = {
      'method': 'get',
      'headers': {
        'Authorization': `Bearer ${LINE_CHANNEL_TOKEN}`
      }
    };
    return UrlFetchApp.fetch(url, options);
  } catch (e) {
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), 'LINEコンテンツ取得失敗', messageId])
  }
}
/**
 * gyazoに画像をアップロード
 * @param {blob} file - 画像ファイル
 * @return {string} url - 画像url
 */
function uploadGyazo(file) {
  try {
    const res = UrlFetchApp.fetch("https://upload.gyazo.com/api/upload", {
      method: "POST",
      'payload': {
        access_token: GYAZO_API_KEY,
        imagedata: file.getAs('image/jpeg')
      },
      muteHttpExceptions: true,
    })
    return JSON.parse(res.getContentText()).url
  } catch (e) {
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), 'アップロード失敗', e])
  }
}

/**
 * 自然言語処理
 * 参考：https://qiita.com/TakeshiNickOsanai/items/84cdd0da017a5d5d56b9
 */
function retrieveSentiment(textData) {
  try {
    const apiEndpoint =
      'https://language.googleapis.com/v1/documents:analyzeEntities?key='
      + GOOGLE_API_KEY;

    const docDetails = {
      language: 'ja-jp',
      type: 'PLAIN_TEXT',
      content: textData
    };

    const nlData = {
      document: docDetails,
      encodingType: 'UTF8'
    };

    const nlOptions = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(nlData)
    };

    const response = UrlFetchApp.fetch(apiEndpoint, nlOptions);
    return JSON.parse(response)["entities"][0]['name']
  } catch (e) {
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), '自然言語処理失敗', e])
  }

}

function getCookie() {
  return "connect.sid=" + sid;
}

function getToken() {
  const userInfoJSON = UrlFetchApp.fetch("https://scrapbox.io/api/users/me", {
    method: "get",
    headers: {
      "Cookie": getCookie(sid)
    }
  });
  console.log(JSON.parse(userInfoJSON))
  const userInfoData = JSON.parse(userInfoJSON);
  const csrfToken = userInfoData.csrfToken
  return csrfToken
}

/**
 * 書き込み関数
 * @param {string} title - タイトル
 * @param {string} imageUrl - 画像URL
 * @param {string} main - 本文
 */
const exportPages = (title, imageUrl, main) => {
  logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), 'エクスポート開始', title, imageUrl, main])
  try {
    const br = /[\r\n]+/g; //改行
    const rep = " "; //置換文字列

    const date = Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss');
    const importPages = [{
      "title": `【自動取り込み】${title}`,
      "lines": [`【自動取り込み】${title}`, `生成日時：${date}`, `[${imageUrl}]`, `>${main.replace(br, rep)}`, "", '#名刺アップローダー']
    }]

    const form = FetchApp.createFormData();
    form.append(
      "import-file",
      Utilities.newBlob(JSON.stringify({ "pages": importPages }), "application/octet-stream")
    );
    const cookie = getCookie()

    const options = {
      "method": "POST",
      "headers": {
        "Accept": "application/json, text/plain, */*",
        "Cookie": cookie,
        "X-CSRF-TOKEN": getToken(),
      },
      muteHttpExceptions: true,
      "body": form
    };
    const response = FetchApp.fetch(`https://scrapbox.io/api/page-data/import/${projectName}.json`, options);
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), 'エクスポートリクエスト', response.getResponseCode(), response.getContentText()])
    return 'ok'
  } catch (e) {
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), 'エクスポート失敗', e])
    return 'error'
  }
}

/**
 * 読み込み関数
 */
function importPages() {
  const url = `https://scrapbox.io/api/page-data/export/${projectName}.json`
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    contentType: "multipart/form-data",
    headers: {
      "Cookie": getCookie(),
      "X-CSRF-TOKEN": getToken(),
    },
    muteHttpExceptions: true,
  });
  Logger.log(JSON.parse(response).pages[0])
  return 'ok'
}

function test(){
  const contentId = '16639049611553'
   const content = getLineContent(contentId)
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), 'コンテンツ取得完了', contentId])
    const allText = getAnnotate(content)
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), '全文取得完了', allText[0].fullTextAnnotation.text])
    const imageUrl = uploadGyazo(content)
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), '画像アップロード完了', imageUrl])
    const enti = retrieveSentiment(allText[0].fullTextAnnotation.text)
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), '抽出完了', enti])
    const exportRes = exportPages(enti, imageUrl, allText[0].fullTextAnnotation.text)
    logSheet.appendRow([Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss'), 'すくぼ書き込み完了', exportRes])
    return { type: "text", text: `自動取り込みを行いました` };
}
