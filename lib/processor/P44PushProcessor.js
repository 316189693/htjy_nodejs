let P44Service = require("../service/p44/P44Service");
class P44PushProcessor {
    constructor(mysql, config, logger, _, commonUtil, moment) {
        this.service = new P44Service(mysql, config, logger, _, commonUtil, moment);
    }
    async process(apiTransferLine) {
        let order_id = apiTransferLine['tms_order_id'];
        let tms_order_pro = apiTransferLine['tms_order_pro'];
        let tms_api_transfer_id = apiTransferLine['tms_api_transfer_id'];
        let tms_api_config_id = apiTransferLine['reference'];
        await this.service.pushTmsOrdersStatus(tms_api_transfer_id, order_id, tms_order_pro, tms_api_config_id)
    }
}
module.exports = P44PushProcessor;