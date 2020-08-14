
let log = function(logger, e){
    if (logger && e) {
        logger.error(`\r\n ***************** Error ***************** 
                          \nBaseURL: ${e.config && e.config.baseURL? e.config.baseURL : ""}
                          \nURL: ${e.config && e.config.url ? e.config.url : ""}
                          \nRequest: ${e.config && e.config.data ? e.config.data: ""}
                          \nMethod: ${e.config && e.config.method ? e.config.method : ""}
                          \nAuth: ${e.config && e.config.auth ? JSON.stringify(e.config.auth) : ""}
                          \nStatus: ${e.response && e.response.status? e.response.status : -1}
                          \nstatusText: ${e.response && e.response.statusText ? e.response.statusText : ""}
                          \nerrorMessage: ${e.response && e.response.data && e.response.data.errorMessage? e.response.data.errorMessage : ""}
                          \nerrors: ${e.response && e.response.data && e.response.data.errors? JSON.stringify(e.response.data.errors) : ""}
                          \nStack: ${e.stack}
                          \n***************** Error *****************
               `);
    }
};
let generateMessage = function(e) {
    let message = "";
    if(e.response) {
        if (e.response.status) {
            message += "status:" + e.response.status;
        }
        if (e.response.statusText) {
            message += "statusText:" + e.response.statusText;
        }
        if (e.response.data && e.response.data.errorMessage) {
            message += "errorMessage:"+ e.response.data.errorMessage;
        }
        if (e.response.data && e.response.data.errors) {
            message += "errors:"+ JSON.stringify(e.response.data.errors);
        }

    }
    if (message == "") {
        message += "stack:"+ e.stack;
    }
    return message;
}

module.exports = {
    post : async function(axiosInstance, url, data, logger = null){
        let res = {'status':null, 'data':null, 'message':null};
        try{
            let rst = await axiosInstance.post(url, data);
            res.status = rst['status'];
            res.data = rst['data'];
        } catch(e){
              res.status = 500;
              res.message = generateMessage(e);
             log(logger, e);
        }
        return res;
   },
    put : async function(axiosInstance, url, data, logger = null){
        let res = {'status':null, 'data':null,'message':null};
        try{
            let rst = await axiosInstance.put(url, data);
            res.status = rst['status'];
            res.data = rst['data'];
        } catch(e){
            res.status = 500;
            res.message = generateMessage(e);
            log(logger, e);
        }
        return res;
    },
    get : async function(axiosInstance, url, logger = null){
        let res = {'status':null, 'data':null, 'message':null};
        try{
            let rst = await axiosInstance.get(url);
            res.status = rst['status'];
            res.data = rst['data'];
        } catch(e){
            res.status = 500;
            res.message = generateMessage(e);
            log(logger, e);
        }
        return res;
    }

}