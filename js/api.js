/**
 js/axios.min.js
 config.js
 */

let user;
let pass;
let loginName;
let callNum;
let domain;
let device;
let devices = [];
let MakeCallPerformanceTracker;
const maxCallHistoryDays = 30;
/**
 * Enables Console logging.
 * For ease of access, please keep this as the first function in this class.
 */
function log(input){
    //console.log(input);
}

// Call to NetSapiens API
if(apiUrl !== '' || typeof apiUrl !== 'undefined'){
    url = managerPortal + '/ns-api/';
} else {
    url = apiUrl + '/ns-api/';
}

/**
 * Generates a api request to net-sapiens
 * @param method: request method.
 * @param appendURL: URL string to be appended to base API URL call string.
 * @param data: Parameters to be sent with call.
 * @param headers: Request headers.
 * @param error: Error function to be executed if call fails.
 * @param success: Function to be executed if call succeeds.
 * @returns {Promise<T | never>} Returns promise for Await call.
 */
function nsCall(method, appendURL = null, data = null, headers = null, error = null, success = null) {

    let config = {
        method,
    };
    let callURL = appendURL? url + appendURL: url;
    config.headers = headers? headers: null;
    if(data){
        const params = new URLSearchParams();
        for(let k in data){
            params.append(k, data[k]);
        }
        config.data = params;
    }
    return axios(callURL, config)
        .then(function (response) {

            // handle success
            if (success){

                success(response);
            }
            return response;
        }).catch(function (err) {

            if (error){

                error(err);
            }
            return error;
        });
}

/**
 * Take oAuth Token and register call via post to domain.
 * @param accessToken: oAuth token.
 * @param args: arguments passed to makeCall as a callback
 *          args.number: sets number to dial.
 *                          If not set defaults to CallNum.
 *          args.func: function to be executed after successful call.
 *          args.errFunc: function to be executed after failed call.
 *          args.{other}: arguments passed to callback functions.
 */
async function makeCall(token = null, args = null){
    if(token) {

        dial(await checkNSAuthToken(token), args);
    } else {

        chrome.storage.sync.get({
            token: null,
            expires_in: null,
            expires_at: null,
            refreshToken: null,
        }, async function (items) {

            dial(await checkNSAuthToken({
                token: items.token,
                expires_in: items.expires_in,
                expires_at: items.expires_at,
                refreshToken: items.refreshToken,
            }), args);
        });
    }
}

function dial(accessToken, args) {

    if(args && args.destination){

        callNum = args.destination;
    }else if (args && args.number){
        callNum = args.number;
        callNum.replace(/[a-cA-C]/g, '2')
            .replace(/[d-fD-F]/g, '3')
            .replace(/[g-iG-I]/g, '4')
            .replace(/[j-lJ-L]/g, '5')
            .replace(/[m-oM-O]/g, '6')
            .replace(/[p-sP-S]/g, '7')
            .replace(/[t-vT-V]/g, '8')
            .replace(/[w-zW-Z]/g, '9');
    }
    log( 'makeCall()');
    log( '-callid: ' + callNum + "-" + new Date().getTime());
    log('-uid ' + user + '@' + domain);
    log('-user: ' + user);
    log('-domain: ' + domain);
    log('-destination: ' + callNum);
    log('-token: ' + accessToken);
    log('-login: ' + loginName);
    //log('-device sip: ' + device);
    let data = {
        object: 'call',
        action: 'call',
        callid: callNum + "-" + new Date().getTime(),
        uid: user + '@' + domain,
        destination: callNum,
        //auto: 'yes',
    };
    if(device && device !== '') {

        data.origination = device;
    }
    successfunc = function(response){
        log('-' + extension_initials + ' call went through to ' + callNum);
        log(response);
        if(args && args.func){

            args.func(args);
        }
        log('Make Call Start To Finish: ' + (new Date().getTime() - MakeCallPerformanceTracker)/1000
            + 'seconds.');
    };
    errFunc = function(xhr, exception){

        log('Call Failed: ');
        log(xhr);
        log(exception);
        if(args && args.errFunc){

            args.errFunc(args);
        }
    };
    let headers = {
        "Content-Type": 'application/x-www-form-urlencoded',
        "Authorization": "Bearer " + accessToken,
    };
    nsCall('post', null, data, headers, errFunc, successfunc);
}

/**
 * Check is existing call has been run through oAuth and registered with domain and does so if not already done
 * with enough time remaining on the registered call.
 */
async function checkNSAuthToken(token, expires_in = null, expires_at = null, refreshToken = null, promise = null){

    MakeCallPerformanceTracker = new Date().getTime();
    if(typeof token == 'object'){

        expires_in = token.expires_in;
        expires_at = token.expires_at;
        refreshToken = token.refreshToken;
        promise = token.promise;
        token = token.token;
    }

//User has not submitted credentials.
    if(typeof pass === 'undefined' || typeof user === 'undefined' || pass==='' || user==='') {

        let tempExtensionName;
        if (extension_name === "") {

            tempExtensionName = 'the';
        } else {

            tempExtensionName = extension_name;
        }
        alert("Please register your username and password in " + tempExtensionName + " extension options Page.");
        return null;
    }
    let data = {
        client_id: clientID,
        client_secret: clientSecret,
    };
    //If oAuth has not been retrieved.
    if (!token
        || !expires_in
        || !expires_at
        || !expires_in
        || !expires_at) {

        data.grant_type = 'password';
        data.username = loginName;
        data.password = pass;
    } else {
        //if oAuth has been retrieved but it is expired.
        if ((new Date().getTime() - parseInt(expires_at)) < (parseInt(expires_in) * 1000)) {

            if(promise){ promise(token); }
            return token;
        } else {
            data.grant_type = 'refresh_token';
            data.refresh_token = refreshToken;
        }
    }
    const response = await nsCall('post', 'oauth2/token/', data,
        {'Content-Type': 'application/x-www-form-urlencoded'},
        function(exception){

            log('Invalid Credentials (code: ' + exception + ')');
            log(exception);
            alert("Invalid Credentials, please visit this extension's options and set your username and"
                + " password.");
            return exception;
        },
        function(response){

            chrome.storage.sync.set({
                token: response.data.access_token,
                expires_in: response.data.expires_in,
                expires_at: new Date().getTime(),
                refreshToken: response.data.refresh_token,
            });
            if(promise){
                promise(response.data.access_token);
            }
            return response;
        });

    if(promise){
        promise(response.data.access_token);
    }
    return response.data.access_token;
}

/**
 * Retrieve List of devices from PBX.
 * @param accessToken
 * @param domain
 * @param user
 * @returns {Promise<*>}
 */
async function getDevices(accessToken, domain, user, promise){

    devices = [];
    await nsCall('post', null,
        {
            object: 'device',
            action: 'read',
            domain: domain,
            user: user,
        },
        {"Content-Type": 'application/x-www-form-urlencoded',
            "Authorization": "Bearer " + accessToken,},

        function(response) { errLog(response, 'Could not load devices.'); },
        function (response) {

            for(let i = 0; i < response.data.length; i++) {

                let deviceName, deviceAor;
                if(response.data[i].model) {

                    deviceName = response.data[i].model;
                } else {

                    deviceName = response.data[i].user_agent;
                }
                deviceAor = response.data[i].aor.split('@')[0];

                devices.push({
                    aor: deviceAor.replace('sip:', ''),
                    model: deviceName
                });
            }
        }
    );
    promise(devices);
}

function getCallHistory(accessToken, domain, user, promise, date = null, days = null) {

    const MAX_CALL_HISTORY_ITEMS = 10;
    const MILLISECONDS_PER_SECOND = 1000;
    let curDate;
    let prevDate;

    if(date){

        curDate = date;
        prevDate = date;
    } else {

        curDate = new Date();
        prevDate = new Date();
    }
    if(!days){
        days = maxCallHistoryDays;
    }
    let curDateDay = curDate.getDate();
    let curDateMonth = curDate.getMonth() + 1;
    let endDate = curDate.getFullYear()
        + '-' + (curDateMonth < 10 ? '0' + curDateMonth : curDateMonth)
        + '-' + (curDateDay < 10 ? '0' + curDateDay : curDateDay);

    prevDate.setDate(prevDate.getDate() - days);
    let prevDateDay = prevDate.getDate();
    let prevDateMonth = prevDate.getMonth() + 1;
    let startDate = prevDate.getFullYear()
        + '-' + (prevDateMonth < 10 ? '0' + prevDateMonth : prevDateMonth)
        + '-' + (prevDateDay < 10 ? '0' + prevDateDay : prevDateDay);

    let data = {
        object: 'cdr2',
        action: 'read',
        start_date: startDate,
        end_date: endDate,
        limit: MAX_CALL_HISTORY_ITEMS,
        uid: user + '@' + domain,
    };

    nsCall('post', null, data, {
            "Content-Type": 'application/x-www-form-urlencoded',
            "Authorization": "Bearer " + accessToken,
        },
        function (response) {
            errLog(response, 'Could not load call history.');
        },
        function (response) {
            console.log(response.data);
            let calls = [];
            for(let i = 0; i < response.data.length, i < MAX_CALL_HISTORY_ITEMS; i++){

                calls.push({
                    duration: response.data[i].duration,
                    name: response.data[i].name,
                    start: response.data[i].time_start * MILLISECONDS_PER_SECOND,
                    number: response.data[i].number,
                    type: response.data[i].type,
                    origin: response.data[i].orig_to_uri.replace('sip:', ''),
                    answer: response.data[i].time_answer,
                });
            }
            promise(calls);
        }
    );
}

function errLog(response, msg = null){

    log(msg);
    log(response);
    return response;
}