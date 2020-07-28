module.exports = {
   isArray: function (ary){
	  return ary && toString.call(ary) === '[object Array]' && ary.length > 0;
    },
    isFunction: function (func) {
       return func && toString.call(func) === '[object Function]';
    }
}