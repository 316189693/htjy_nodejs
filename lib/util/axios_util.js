
module.exports = {
    post : async function(axiosInstance, url, data){
        let res = {'status':null, 'data':null, 'error':null,'message':null};
        try{
            let rst = await axiosInstance.post(url, data);
            res.status = rst['status'];
            res.data = rst['data'];
        } catch(e){
              res.status = 500;
              res.error = e;
              res.message = e.message;
        }
        return res;
   },
    put : async function(axiosInstance, url, data){
        let res = {'status':null, 'data':null, 'error':null,'message':null};
        try{
            let rst = await axiosInstance.put(url, data);
            res.status = rst['status'];
            res.data = rst['data'];
        } catch(e){
            res.status = 500;
            res.error = e;
            res.message = e.message;
        }
        return res;
    },
    get : async function(axiosInstance, url){
        let res = {'status':null, 'data':null, 'error':null,'message':null};
        try{
            let rst = await axiosInstance.get(url);
            res.status = rst['status'];
            res.data = rst['data'];
        } catch(e){
            res.status = 500;
            res.error = e;
            res.message = e.message;
        }
        return res;
    }

}