let P44Service = require("../service/p44/P44Service");
class P44LoadProcessor {
    constructor(mysql, config, logger, _, commonUtil, moment) {
        this.service = new P44Service(mysql, config, logger, _, commonUtil, moment);
    }
    async process(apiTransferLine) {
        await this.service.createLTLShipment(apiTransferLine);
    }

}
module.exports = P44LoadProcessor;