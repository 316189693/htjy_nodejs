let p44_config = require('./project_44_refer_data.json');
let P44Apis = require('./P44Apis');
let ApiName = require("../../config/ApiName")
let ApiStatus = require("../../config/ApiStatus");
let ApiType = require("../../config/ApiType");
let axios_util = require("../../util/axios_util");
let axios = require('axios');


// project 44 integrate util
class P44Service {
    constructor(mysql, config, logger, _, commonUtil, moment) {
        this.mysql = mysql;
        this.config = config;
        this._ = _;
        this.logger = logger;
        this.commonUtil = commonUtil;
        this.moment = moment;
        this.axiosInstance = axios.create({
            baseURL: this.config.project_44_host,
            timeout: 10000,
            auth: {
                username: this.config.project_44_user_name,
                password: this.config.project_44_password
            }
        });
    }




    //let url ="https://test-v2.p-44.com/api/v4/ltl/trackedshipments/statuses?shipmentIdentifier.type=PRO&shipmentIdentifier.value=12580713";
    async getLastShipmentStatusByPro(pro) {
        let res = { "status": -1, "data": null, "error": null };
        let url = `${P44Apis.get_project_44_ltl_tracking_url}?shipmentIdentifier.type=PRO&shipmentIdentifier.value=${pro}`;
        let result = null;
        try {
            let response = await axios_util.get(this.axiosInstance,url);
            let data = response.data;
            this.logger.info(JSON.stringify({ "response": data }));
            if (!data || !data['shipmentStatuses'] || !data['shipmentStatuses'][0] || !data['shipmentStatuses'][0]['latestStatusUpdate']) {
                let info_msg = `PRO-${pro} call project 44 tracking info:`;
                if (this.logger) {
                    this.logger.info(info_msg);
                    this.logger.info(data);
                }
                res.data = data;
                res.status = 2;
            } else {
                res.data = data['shipmentStatuses'][0]['latestStatusUpdate'];
                res.status = 1;
            }
        } catch (e) {
            if (this.logger) {
                this.logger.error(`PRO-${pro} call project 44 tracking error:`);
                this.logger.error(e);
            }
            res.error = e.message;
        }
        return res;
    }


    async createLTLShipment(tms_api_transfer_id, order_id, tms_order_pro, tms_api_config_id) {
        let [p44Config, orderInfo] = await Promise.all([
            this.fetchP44ApiConfig(tms_api_config_id),
            this.fetchOrderInfo(order_id, tms_order_pro)
        ]);
        let data = this.createLtlShipmentRequest(p44Config, orderInfo);
        let url = P44Apis.put_project_44_ltl_create_shipments_url;
        let transfer_line_id = tms_api_transfer_id;
        let response = await axios_util.put(this.axiosInstance, url, data);
        let request_str = this.mysql.escapeStr(JSON.stringify({ "url": url, "method": "PUT", "request": data , "api_config_id":tms_api_config_id}));
        let response_str = this.mysql.escapeStr(JSON.stringify({ "status": response.status, "data": response.data || response.error }));
        let tms_api_transfer_status = ApiStatus.SUCCESS;
        let tms_api_transfer_internal_status = ApiStatus.COMPLETE;
        if (![200, 201, 202].includes(response.status)) {
            tms_api_transfer_status = ApiStatus.ERROR;
            tms_api_transfer_internal_status = "";
        }
        let update_sql = `update tms_api_transfer
                                 set tms_api_transfer_status='${tms_api_transfer_status}',tms_api_transfer_update_when= now(),
                                    tms_api_transfer_request = ${request_str}, tms_api_transfer_response=${response_str},
                                    tms_api_transfer_internal_status='${tms_api_transfer_internal_status}'
                                 where tms_api_transfer_id = ${transfer_line_id};
                                 `;
        await this.mysql.query(update_sql);
    }

    async trackedLTLShipment(tms_api_transfer_id, order_id, tms_order_pro, tms_api_config_id) {
        let [p44Config, orderInfo] = await Promise.all([
            this.fetchP44ApiConfig(tms_api_config_id),
            this.fetchOrderInfo(order_id, tms_order_pro)
        ]);
        let data = this.createLtlTrackedShipmentRequest(p44Config, orderInfo);
        let url = P44Apis.post_project_44_ltl_tracked_shipments_url;
        let transfer_line_id = tms_api_transfer_id;
        let response = await axios_util.post(this.axiosInstance, url, data);
        let request_str = this.mysql.escapeStr(JSON.stringify({ "url": url, "method": "POST", "request": data, "api_config_id": tms_api_config_id}));
        let response_str = "''";
        let tms_api_transfer_status = ApiStatus.ERROR;
        let tms_api_transfer_internal_status = "";
        if ([200, 201, 202].includes(response.status)) {
            tms_api_transfer_status = ApiStatus.SUCCESS;
            tms_api_transfer_internal_status = ApiStatus.COMPLETE;
            if (response.data && response.data.shipment) {
                let track_response = response.data.shipment;
                response_str = this.mysql.escapeStr(JSON.stringify({
                    "id": track_response['id'], "masterShipmentId": track_response['masterShipmentId'],
                    "ltlLegId": track_response['ltlLegId'], 'apiConfiguration': track_response['apiConfiguration'],
                    "shipmentAttributes": track_response['shipmentAttributes']
                }));
            } else {
                response_str = this.mysql.escapeStr(JSON.stringify({ "status": response.status, "data": response.data }));
            }

        } else {
            response_str = this.mysql.escapeStr(JSON.stringify({ "status": response.status, "data": response.data || response.error }));
        }
        let update_sql = `update tms_api_transfer
                                 set tms_api_transfer_status='${tms_api_transfer_status}',tms_api_transfer_update_when= now(),
                                    tms_api_transfer_request = ${request_str}, tms_api_transfer_response=${response_str},
                                    tms_api_transfer_internal_status='${tms_api_transfer_internal_status}'
                                 where tms_api_transfer_id = ${transfer_line_id};
                                 `;
        await this.mysql.query(update_sql);
    }

    createLtlTrackedShipmentRequest(p44Config, orderInfo) {
        let request = {
            "capacityProviderAccountGroup": {
                "code": p44Config['tms_p44_api_config_carrier_capacity_provider_account_group_code'],
                "accounts": [
                    {
                        "code": p44Config['tms_p44_api_config_carrier_identifier_value']
                    }
                ]
            },
            "shipmentIdentifiers": [
                {
                    "type": "PRO",
                    "value": orderInfo['tms_order_pro']
                }
            ],
            "shipmentStops": [
                {

                    "stopType": "ORIGIN",
                    "location": {
                        "address": {
                            "postalCode": orderInfo['pickup_zip'],
                            "addressLines": [
                                orderInfo['pickup_street']
                            ],
                            "city": orderInfo['pickup_city'],
                            "state": orderInfo['pickup_state'],
                            "country": "US"
                        },
                        "contact": {
                            "companyName": orderInfo['pickup_name']
                        }
                    },
                    "appointmentWindow": {
                        "startDateTime": orderInfo['pickup_date'] + "T" + orderInfo['pickup_time'],
                        "endDateTime": orderInfo['pickup_date'] + "T" + orderInfo['pickup_time_to']

                    },

                    "stopNumber": 1

                },
                {

                    "stopType": "DESTINATION",
                    "location": {
                        "address": {
                            "postalCode": orderInfo['delivery_zip'],
                            "addressLines": [
                                orderInfo['delivery_street']
                            ],
                            "city": orderInfo['delivery_city'],
                            "state": orderInfo['delivery_state'],
                            "country": "US"
                        }, "contact": {
                            "companyName": orderInfo['delivery_name']
                        }
                    },
                    "appointmentWindow": {
                        "startDateTime": orderInfo['delivery_date'] + "T" + orderInfo['delivery_time'],
                        "endDateTime": orderInfo['delivery_date'] + "T" + orderInfo['delivery_time_to']

                    },

                    "stopNumber": 2
                }
            ],
              "apiConfiguration": {

                "fallBackToDefaultAccountGroup": false

             }
        };
        return request;
    }

    createLtlShipmentRequest(p44Config, orderInfo) {
        return {
            "customerAccount": {
                "accountIdentifier": p44Config['tms_p44_api_config_carrier_customer_account_identifier'],
            },
            "carrierIdentifier": {
                "type": p44Config['tms_p44_api_config_carrier_identifier_type'],
                "value": p44Config['tms_p44_api_config_carrier_identifier_value']
            },
            "shipmentIdentifiers": [
                {
                    "type": "PRO",
                    "value": orderInfo['tms_order_pro'],
                    "primaryForType": true,
                    "source": "CUSTOMER"
                }
            ],
            "shipmentStops": [
                {

                    "stopType": "ORIGIN",
                    "location": {
                        "address": {
                            "postalCode": orderInfo['pickup_zip'],
                            "addressLines": [
                                orderInfo['pickup_street']
                            ],
                            "city": orderInfo['pickup_city'],
                            "state": orderInfo['pickup_state'],
                            "country": "US"
                        },
                        "contact": {
                            "companyName": orderInfo['pickup_name']
                        }
                    },

                    "stopNumber": 1

                },
                {

                    "stopType": "DESTINATION",
                    "location": {
                        "address": {
                            "postalCode": orderInfo['delivery_zip'],
                            "addressLines": [
                                orderInfo['delivery_street']
                            ],
                            "city": orderInfo['delivery_city'],
                            "state": orderInfo['delivery_state'],
                            "country": "US"
                        }, "contact": {
                            "companyName": orderInfo['delivery_name']
                        }

                    },


                    "stopNumber": 2
                }
            ],

            "sourceType": "API"
        };
    }

    async fetchOrderInfo(tms_order_id, tms_order_pro) {
        tms_order_pro = "'"+tms_order_pro+"'";
        let sql = `select ${tms_order_pro} as tms_order_pro, 
	               ifnull(tms_order.tms_order_pickup_name, '') as pickup_name,
	               CONCAT(ifnull(tms_order.tms_order_pickup_street, ''),' ',ifnull(tms_order.tms_order_pickup_street2, '')) as pickup_street,
	               ifnull(tms_order.tms_order_pickup_city, '') as pickup_city,
	               ifnull(tms_order.tms_order_pickup_state, '') as pickup_state,
	               ifnull(tms_order.tms_order_pickup_zip, '') as pickup_zip,
	               ifnull(tms_order.tms_order_pickup_lat, '') as pickup_lat,
	               ifnull(tms_order.tms_order_pickup_lng, '') as pickup_lng,
	               ifnull(tms_order.tms_order_pickup_date, '') as pickup_date,
	      
	               IF(tms_order.tms_order_appointment_time != 0, TIME_FORMAT(tms_order.tms_order_appointment_time, '%H:%i:%s'), '00:00:01') as pickup_time,
	               IF(tms_order.tms_order_appointment_time_to != 0, TIME_FORMAT(tms_order.tms_order_appointment_time_to, '%H:%i:%s'), '23:59:59') as pickup_time_to,
	           
	
                   ifnull(tms_order.tms_order_delivery_name, '') as delivery_name,
	               CONCAT(ifnull(tms_order.tms_order_delivery_street, ''),' ',ifnull(tms_order.tms_order_delivery_street2, '')) as delivery_street,
	               ifnull(tms_order.tms_order_delivery_city, '') as delivery_city,
	               ifnull(tms_order.tms_order_delivery_state, '') as delivery_state,
	               ifnull(tms_order.tms_order_delivery_zip, '') as delivery_zip,
	               ifnull(tms_order.tms_order_delivery_lat, '') as delivery_lat,
	               ifnull(tms_order.tms_order_delivery_lng, '') as delivery_lng,
	               ifnull(tms_order.tms_order_appointment_delivery_date, ifnull(DATE_ADD(tms_order.tms_order_pickup_date,INTERVAL 1 day) , '')) as delivery_date,
	               	               
	               IF(tms_order.tms_order_appointment_delivery_time != 0, TIME_FORMAT(tms_order.tms_order_appointment_delivery_time, '%H:%i:%s'), '00:00:01') as delivery_time,
                   IF(tms_order.tms_order_appointment_delivery_time_to != 0, TIME_FORMAT(tms_order.tms_order_appointment_delivery_time_to, '%H:%i:%s'), '23:59:59') as delivery_time_to,
                   tms_order_status,
                   tms_order_stage
                   from tms_order  where tms_order_id =  ${tms_order_id} 
                   limit 1`;
        return await this.mysql.assocQuery(sql);
    }

    async fetchP44ApiConfig(tms_p44_api_config_id) {
        let sql = `select tms_p44_api_config_id,fk_company_id, tms_p44_api_config_billto_id,tms_p44_api_config_carrier_id,tms_p44_api_config_carrier_identifier_type,
                       tms_p44_api_config_carrier_identifier_value, tms_p44_api_config_carrier_customer_account_identifier,
                        tms_p44_api_config_carrier_capacity_provider_account_group_code, tms_p44_api_config_shipper_push_tracking_updates_to_project_44,
                        tms_p44_api_config_carrier_load_tracking_updates_from_project_44
                     from tms_p44_api_config where tms_p44_api_config_id=${tms_p44_api_config_id};`;
        return await this.mysql.assocQuery(sql);
    }


    async fetchShipmentCreatedOrders(companyIds, limit_num, order_id, start_date) {
        if (!this.commonUtil.isArray(companyIds)) {
            return null;
        }
        let order_id_filter = "";
        if (order_id && parseInt(order_id) > 0) {
            order_id_filter = " and tms_order.tms_order_id = " + order_id;
        }
        let companyIdStr = companyIds.join();
        let tms_order_company_filter = `and tms_order.fk_company_id in (${companyIdStr})`;
        let tms_p44_api_config_company_filter = `and tms_p44_api_config.fk_company_id in (${companyIdStr})`;
        let sql = `
                  select  tms_order.tms_order_id, tms_order.tms_order_pro, tms_order.fk_company_id, 
                          tms_p44_api_config.tms_p44_api_config_id            
                 from tms_p44_api_config
                  inner join tms_dispatch on tms_dispatch.fk_carrier_id = tms_p44_api_config.tms_p44_api_config_carrier_id 
	                                         ${tms_p44_api_config_company_filter}
                                             and tms_dispatch.fk_carrier_id is not null
                 inner join task_group on tms_dispatch.tms_dispatch_id = task_group.fk_tms_dispatch_id
                 inner join (
                             select tms_order.tms_order_id, tms_ap.tms_ap_carrier_pro as tms_order_pro, tms_order.fk_company_id
                             from tms_order 
                                       inner join tms_ap on tms_order.tms_order_id = tms_ap.fk_tms_order_id and tms_ap_carrier_pro is not null
                                                   and tms_ap.tms_ap_status = 0
                                              ${order_id_filter}
                             where  date(tms_order.tms_order_created_date) >  date('${start_date}') 
                                    and tms_order.tms_order_pro is not null
                                    ${order_id_filter}
                                    ${tms_order_company_filter}
                                    and not EXISTS ( select 1 
                                                     from tms_api_transfer 
                                                     where tms_api_transfer.fk_tms_order_id = tms_order.tms_order_id 
                                                     and tms_api_transfer.tms_api_transfer_api_name = '${ApiName.P44_create_shipment}'
                                                     and (tms_api_transfer_internal_status = '${ApiStatus.COMPLETE}'
                                                          or tms_api_transfer_status not in ('${ApiStatus.ERROR}', '${ApiStatus.SUCCESS}')
                                                          )
                                                     and tms_api_transfer.tms_api_transfer_lines_inout='${ApiType.OUT}'
                                                   )            
                                                          
                             ) as tms_order on tms_order.tms_order_id = task_group.fk_tms_order_id 
                  where tms_p44_api_config.tms_p44_api_config_carrier_load_tracking_updates_from_project_44 = 1
               limit ${limit_num}; `;
        let raw = await this.mysql.query(sql);
        let new_result = [];
        if (raw) {
            let new_array = [];
            let row_key = "";
            let row = null;
            for (let k in raw) {
                row = raw[k];
                row_key = row['tms_order_id']+"-"+row['tms_order_pro']+"-"+row['fk_company_id']+"-"+raw['tms_p44_api_config_id'];
                if (new_array.indexOf(row_key) == -1){
                    new_array.push(row_key);
                    new_result.push(row);
                }
            }
        }
        return new_result;
    }



    async fetchDispatchedOrders(companyIds, limit_num, start_date) {
        if (!this.commonUtil.isArray(companyIds)) {
            return null;
        }
        let companyIdStr = companyIds.join();
        let tms_order_company_filter = `and tms_order.fk_company_id in (${companyIdStr})`;
        let tms_p44_api_config_company_filter = `and tms_p44_api_config.fk_company_id in (${companyIdStr})`;
        let sql = `
                  select  tms_order.tms_order_id, tms_order.tms_order_pro, tms_order.fk_company_id, 
                          tms_p44_api_config.tms_p44_api_config_id            
                 from tms_p44_api_config
                 inner join tms_dispatch on tms_dispatch.fk_carrier_id = tms_p44_api_config.tms_p44_api_config_carrier_id 
	                                         ${tms_p44_api_config_company_filter}
                                             and tms_dispatch.fk_carrier_id is not null
                 inner join task_group on tms_dispatch.tms_dispatch_id = task_group.fk_tms_dispatch_id
                 inner join (
                             select tms_order.tms_order_id, tms_ap.tms_ap_carrier_pro  as tms_order_pro, tms_order.fk_company_id
                             from tms_order 
                              inner join tms_ap on tms_order.tms_order_id = tms_ap.fk_tms_order_id and tms_ap_carrier_pro is not null
                                                   and tms_ap.tms_ap_status = 0
                             where
                                           date(tms_order.tms_order_created_date) >  date('${start_date}')
                                            ${tms_order_company_filter}
                                           and  exists(select 1 
                                                  from tms_api_transfer 
                                                  where tms_api_transfer.fk_tms_order_id = tms_order.tms_order_id  
                                                        and tms_api_transfer.tms_api_transfer_api_name = '${ApiName.P44_create_shipment}'
                                                        and  tms_api_transfer_internal_status = '${ApiStatus.COMPLETE}' 
                                                         
                                                 )
                                            and  not EXISTS ( select 1 
                                                    from tms_api_transfer 
                                                    where tms_api_transfer.fk_tms_order_id = tms_order.tms_order_id 
                                                          and tms_api_transfer.tms_api_transfer_api_name = '${ApiName.P44_tracked_shipment}' 
                                                          and (tms_api_transfer_internal_status = '${ApiStatus.COMPLETE}'
                                                               or tms_api_transfer_status not in ('${ApiStatus.ERROR}', '${ApiStatus.SUCCESS}')
                                                               ) 
                                                          and tms_api_transfer.tms_api_transfer_lines_inout='${ApiType.OUT}'
                                                  )                                                   
                                             and exists (select 1 
                                                         from task_group 
                                                         where task_group.fk_tms_order_id = tms_order.tms_order_id 
                                                         and task_group.task_group_void = 0
                                                         and task_group.task_group_skip = 0
                                                  )
                                                        
                  ) as tms_order on tms_order.tms_order_id = task_group.fk_tms_order_id 
                 where tms_p44_api_config.tms_p44_api_config_carrier_load_tracking_updates_from_project_44 = 1
               limit ${limit_num}; `;
        let raw = await this.mysql.query(sql);
        let new_result = [];
        if (raw) {
            let new_array = [];
            let row_key = "";
            let row = null;
            for (let k in raw) {
                row = raw[k];
                row_key = row['tms_order_id']+"-"+row['tms_order_pro']+"-"+row['fk_company_id']+"-"+raw['tms_p44_api_config_id'];
                if (new_array.indexOf(row_key) == -1){
                    new_array.push(row_key);
                    new_result.push(row);
                }
            }
        }
        return new_result;
    }

    /**
     *  current date is 2020-02-30
     *  if dateInterval=2, then we will delete lines that <= '2020-02-28'
     */
    async deleteTmsApiTransfer(dateInterval, companyIds) {
        let companyFilterStr = "";
        if (this.commonUtil.isArray(companyIds)) {
            let companyIdStr = companyIds.join();
            companyFilterStr = ` and  fk_company_id in (${companyIdStr}) `;
        }

        let interval = parseInt(dateInterval) <= 0 ? 1 : parseInt(dateInterval);
        let sql = `delete from tms_api_transfer where  date(tms_api_transfer_create_when) <= DATE_SUB(CURRENT_DATE(), INTERVAL ${interval} DAY) ${companyFilterStr};` ;
        await this.mysql.query(sql);
    }

    /**
      * fetch orders which shipper has enabled push project 44 tracking status table 'tms_p44_api_config',
      * it is the column 'tms_p44_api_config_shipper_push_tracking_updates_to_project_44', 1 means enabled, 
      0 is disabled 
     */
    async fetchOrdersOfEnabledPushTrackingStatusToP44CarrierByCompanyIds(companyIds, limit_num, start_date) {
        if (!this.commonUtil.isArray(companyIds)) {
            return null;
        }
        let companyIdStr = companyIds.join();
        let tms_order_company_filter = `and tms_order.fk_company_id in (${companyIdStr})`;
        let tms_p44_api_config_company_filter = `and tms_p44_api_config.fk_company_id in (${companyIdStr})`;
        let sql = `
                  select  tms_order.tms_order_id, tms_order.tms_order_pro, tms_order.fk_company_id, 
                          tms_p44_api_config.tms_p44_api_config_id            
                 from tms_p44_api_config
                 inner join (
                             select tms_order.tms_order_id, tms_order.tms_order_pro, tms_order.fk_company_id,tms_order.fk_billto_id  
                             from tms_order
                             where   date(tms_order.tms_order_created_date) >  date('${start_date}')  
                                     ${tms_order_company_filter}                          
                                      and not EXISTS ( select 1 
                                                       from tms_api_transfer 
                                                       where tms_api_transfer.fk_tms_order_id = tms_order.tms_order_id 
                                                             and tms_api_transfer.tms_api_transfer_api_name = '${ApiName.P44_push}' 
                                                             and (tms_api_transfer_internal_status = '${ApiStatus.COMPLETE}'
                                                                  or tms_api_transfer_status not in ('${ApiStatus.ERROR}', '${ApiStatus.SUCCESS}')
                                                                  ) 
                                                             and tms_api_transfer.tms_api_transfer_lines_inout='${ApiType.OUT}'
                                                      )
                  ) as tms_order on  tms_p44_api_config.tms_p44_api_config_billto_id = tms_order.fk_billto_id 
                  and tms_p44_api_config.tms_p44_api_config_billto_id is not null
                 where tms_p44_api_config.tms_p44_api_config_shipper_push_tracking_updates_to_project_44 = 1
                  ${tms_p44_api_config_company_filter}
               limit ${limit_num}; `;
        let raw = await this.mysql.query(sql);
        let new_result = [];
        if (raw) {
            let new_array = [];
            let row_key = "";
            let row = null;
            for (let k in raw) {
                row = raw[k];
                row_key = row['tms_order_id']+"-"+row['tms_order_pro']+"-"+row['fk_company_id']+"-"+raw['tms_p44_api_config_id'];
                if (new_array.indexOf(row_key) == -1){
                    new_array.push(row_key);
                    new_result.push(row);
                }
            }
        }
        return new_result;
    }



    /**
    * fetch orders which carrier has enabled load shipment staus from project 44, config in  table 'tms_p44_api_config',
    * it is the column 'tms_p44_api_config_carrier_load_tracking_updates_from_project_44', 1 means enabled, 
    0 is disabled 
   */
    async fetchOrdersOfEnabledLoadP44TrackingStatusCarrierByCompanyIds(companyIds,limit_num, order_id,start_date) {
        if (!this.commonUtil.isArray(companyIds)) {
            return null;
        }
        let order_id_filter = "";
        if (order_id && parseInt(order_id) > 0) {
            order_id_filter = " and tms_order.tms_order_id = " + order_id;
        }
        let companyIdStr = companyIds.join();
        let tms_order_company_filter = `and tms_order.fk_company_id in (${companyIdStr})`;
        let tms_p44_api_config_company_filter = `and tms_p44_api_config.fk_company_id in (${companyIdStr})`;
        let sql = ` select tms_order.tms_order_id, tms_order.tms_order_pro, tms_order.fk_company_id, tms_p44_api_config.tms_p44_api_config_id
                  from tms_p44_api_config 
	              inner join tms_dispatch on tms_dispatch.fk_carrier_id = tms_p44_api_config.tms_p44_api_config_carrier_id 
	                                         ${tms_p44_api_config_company_filter}
                                             and tms_dispatch.fk_carrier_id is not null
	              inner join task_group on tms_dispatch.tms_dispatch_id = task_group.fk_tms_dispatch_id
	              inner join (
                              select tms_order.tms_order_id, tms_order.fk_company_id,tms_ap.tms_ap_carrier_pro  as tms_order_pro
                              from tms_order 
                              inner join tms_ap on tms_order.tms_order_id = tms_ap.fk_tms_order_id and tms_ap_carrier_pro is not null
                                                   and tms_ap.tms_ap_status = 0
                                                   ${order_id_filter}
                              where date(tms_order.tms_order_created_date) >  date('${start_date}')
                                     ${tms_order_company_filter} 
                                     and tms_order.tms_order_pro is not null
                                        and exists(select 1 
                                                  from tms_api_transfer 
                                                  where tms_api_transfer.fk_tms_order_id = tms_order.tms_order_id  
                                                        and tms_api_transfer.tms_api_transfer_api_name = '${ApiName.P44_tracked_shipment}'
                                                        and  tms_api_transfer_internal_status = '${ApiStatus.COMPLETE}' 
                                                         
                                                 )
                                     and not EXISTS ( select 1 
                                                 from tms_api_transfer 
                                                 where tms_api_transfer.fk_tms_order_id = tms_order.tms_order_id 
                                                       and tms_api_transfer.tms_api_transfer_api_name = '${ApiName.P44_load}' 
                                                       and (tms_api_transfer_external_status = '${ApiStatus.COMPLETE}'
                                                             or tms_api_transfer_status not in ('${ApiStatus.ERROR}', '${ApiStatus.SUCCESS}')
                                                            ) 
                                                       and tms_api_transfer.tms_api_transfer_lines_inout='${ApiType.IN}'
                                                     )   
                             ) as tms_order on tms_order.tms_order_id = task_group.fk_tms_order_id 
                             where tms_p44_api_config.tms_p44_api_config_carrier_load_tracking_updates_from_project_44 = 1
	               limit ${limit_num};         
                   `;
        let raw = await this.mysql.query(sql);
        let new_result = [];
        if (raw) {
            let new_array = [];
            let row_key = "";
            let row = null;
            for (let k in raw) {
                row = raw[k];
                row_key = row['tms_order_id']+"-"+row['tms_order_pro']+"-"+row['fk_company_id']+"-"+raw['tms_p44_api_config_id'];
                if (new_array.indexOf(row_key) == -1){
                    new_array.push(row_key);
                    new_result.push(row);
                }
            }
        }
        return new_result;
    }


    async insertP44LinesToApiTransfer(p44PushLines, in_out, api_name) {
        if (!this.commonUtil.isArray(p44PushLines)) {
            return null;
        }
        let wait_update_sql = "";
        for (let i = 0; i < p44PushLines.length; i++) {
            let item = p44PushLines[i];
            let order_id = item['tms_order_id'];
            let order_pro = "'"+item['tms_order_pro']+"'";
            let company_id = item['fk_company_id'];
            let p44_config_id = item['tms_p44_api_config_id'];
            wait_update_sql += `insert into tms_api_transfer (fk_tms_order_id, tms_order_pro, fk_company_id, tms_api_transfer_reference,
                                                           tms_api_transfer_api_name, tms_api_transfer_status, tms_api_transfer_lines_inout, 
                                                           tms_api_transfer_create_when) values (${order_id},${order_pro},${company_id},'${p44_config_id}', '${api_name}','WAIT', '${in_out}', now());`;
            if (i > 0 && (i % 50 == 0)) {
                await this.mysql.query(wait_update_sql);
                wait_update_sql = "";
            }
        }
        if (wait_update_sql) {
            await this.mysql.query(wait_update_sql);
        }
    }


    async pushTmsOrdersStatus(tms_api_transfer_id, order_id, pro, tms_api_config_id) {
        let lastPushedTransferLine = await this.getLastSuccessTransferLine(order_id, ApiName.P44_push);
        let old_tms_order_info = null;
        if (lastPushedTransferLine && lastPushedTransferLine['tms_api_transfer_reference']) {
            old_tms_order_info = JSON.parse(lastPushedTransferLine['tms_api_transfer_reference']);
        }
        let current_order_info = await this.fetchOrderInfo(order_id, pro);

        let status_code = null;

        let current_status = current_order_info['tms_order_status'];
        let current_stage = current_order_info['tms_order_stage'];
        let location_type = null;
        if (current_stage == 0) {
            status_code = p44_config["READY_FOR_PICKUP"];
            location_type = "ORIGIN";
        } else if (current_stage == 2) {
            status_code = p44_config["PICKED_UP"];
            location_type = "ORIGIN";
        } else if (current_stage == 4) {
            status_code = p44_config["OUT_FOR_DELIVERY"];
            location_type = "DESTINATION";
        } else if (current_stage == 5) {
            status_code = p44_config["DELIVERED"];
            location_type = "DESTINATION";
        }

        let tms_api_transfer_status = ApiStatus.SKIP;
        let request_str = "";
        let response_str = "''";
        let tms_api_transfer_internal_status = "";
        if (status_code && (old_tms_order_info == null || old_tms_order_info['status_code'] != status_code)) {
            let p44Config = await this.fetchP44ApiConfig(tms_api_config_id);
            let request = this.createStatusUpdateRequest(p44Config, current_order_info, status_code, location_type);
            let pushStatusRes = await axios_util.post(this.axiosInstance, P44Apis.post_project_44_ltl_status_update_url, request);
            request_str = this.mysql.escapeStr(JSON.stringify({ "url": P44Apis.post_project_44_ltl_status_update_url, "method": "post", "request": request,"api_config_id":tms_api_config_id  }));

            if ([200, 201, 202].includes(pushStatusRes.status)) {
                response_str = this.mysql.escapeStr(JSON.stringify({ "status": pushStatusRes.status }));
                if (status_code == p44_config["DELIVERED"]) {
                    tms_api_transfer_internal_status = " ,tms_api_transfer_internal_status='COMPLETE' ";
                }
                tms_api_transfer_status = ApiStatus.SUCCESS;
            } else {
                tms_api_transfer_status = ApiStatus.ERROR;
                response_str = this.mysql.escapeStr(JSON.stringify({ "status": pushStatusRes.status, "data": pushStatusRes.data || response.error }));
                tms_api_transfer_internal_status = " ,tms_api_transfer_internal_status='ERROR' ";
            }

        } else {
            request_str = this.mysql.escapeStr(JSON.stringify({ "current_status": current_status, "current_stage": current_stage, "status_code": status_code, "old_status_code": old_tms_order_info['status_code'], "api_config_id":tms_api_config_id }));
            tms_api_transfer_internal_status = " ,tms_api_transfer_internal_status='ERROR' ";
        }
        let tms_api_transfer_reference_str = this.mysql.escapeStr(JSON.stringify({ "status_code": status_code }));
        let update_sql = `update tms_api_transfer set tms_api_transfer_status='${tms_api_transfer_status}', tms_api_transfer_update_when= now(),
                                    tms_api_transfer_request = ${request_str}, tms_api_transfer_response=${response_str}
                                    ,tms_api_transfer_reference = ${tms_api_transfer_reference_str} 
                                    ${tms_api_transfer_internal_status}
                                    
                                 where tms_api_transfer_id = ${tms_api_transfer_id};
                                 `;
        await this.mysql.query(update_sql);
    }


    async fetchOrderHistory(order_id) {
        let PORTAL_STATUS_INTERNAL_STATUS_MAP = {
            'READY_FOR_PICKUP': ['Pickup Created', 'Accepted: Load BOL', 'Create Order'],
            'UPDATED_PICKUP_APP': ['Shipper Pickup Time', 'Shipper Pickup Time to', 'Pickup Appointment'],
            'PICKED_UP': ['Pickup Completed'],
            'ARRIVED_AT_TERMINAL': ['Current Location', 'Current Terminal Changed', 'EDI 214 CURRENT_LOCAION'],
            'UPDATED_DELIVERY_APPT': ['Updated Delivery Appointment', 'Delivery Apt Update'],
            'DELIVERED': ['Delivery Completed']
        };
        let sql = `
        SELECT * FROM (SELECT
							tms_order_log_id,
							tms_order_log.fk_tms_order_id as order_id,
							tms_order_log_type,
							tms_order_log_status_code,
							tms_order_log_text,
							tms_order_log_location,
							DATE_FORMAT(tms_order_log_created_date,'%Y-%m-%d %h:%i:%s') as c_date,
							tms_order_log_stage,
							tms_order_log_system,
							if(tms_order_log_stage=2 AND revenue.revenue_desc <> 'BROKER', location.location_name, '') as carrier_name,
							tms_order.tms_order_stage
						FROM
							tms_order_log
								LEFT JOIN
							driver ON tms_order_log.fk_driver_id = driver.driver_id
								LEFT JOIN
							location ON tms_order_log.fk_carrier_id = location.location_id
							    LEFT JOIN
							tms_order ON tms_order_log.fk_tms_order_id = tms_order.tms_order_id
							    LEFT JOIN
							revenue ON tms_order.fk_revenue_id = revenue.revenue_id
								LEFT JOIN
							tms_ap ON tms_order_log.fk_tms_ap_id = tms_ap.tms_ap_id
						WHERE
							tms_order_log.fk_tms_order_id = ${order_id}
							AND tms_order_log.tms_order_log_void_id IS NULL
							AND (
								(tms_order_log.fk_tms_ap_id IS NULL OR tms_order_log.fk_tms_ap_id = 0)
								OR
								(
									tms_order_log.fk_tms_ap_id > 0
									AND (tms_ap.tms_ap_type = 'BEY' OR tms_ap.tms_ap_type = 'ADVBEY')
									AND tms_ap.tms_ap_status > - 1
									AND tms_ap.tms_ap_void_id = 0
									AND revenue.revenue_desc <> 'BROKER'
								)
							)
							ORDER BY tms_order_log_id DESC) AS t1
							ORDER BY tms_order_log_id DESC;
        
        `;

    }

    createStatusUpdateRequest(p44Config, orderInfo, status_code, location_type) {
        let stopType, stopNumber, location;
        if (location_type == "DESTINATION") {
            stopType = "DESTINATION";
            stopNumber = 2;
            location = {
                "address": {
                    "postalCode": orderInfo['pickup_zip'],
                    "addressLines": [
                        orderInfo['pickup_street']
                    ],
                    "city": orderInfo['pickup_city'],
                    "state": orderInfo['pickup_state'],
                    "country": "US"
                },
                "contact": {
                    "companyName": orderInfo['pickup_name']
                }
            };
        }
        else if (location_type == "ORIGIN") {
            stopType = "ORIGIN";
            stopNumber = 1;
            location = {
                "address": {
                    "postalCode": orderInfo['delivery_zip'],
                    "addressLines": [
                        orderInfo['delivery_street']
                    ],
                    "city": orderInfo['delivery_city'],
                    "state": orderInfo['delivery_state'],
                    "country": "US"
                }, "contact": {
                    "companyName": orderInfo['delivery_name']
                }
            };
        } else if (location_type == '') {

        }

        return {
            "customerAccount": {
                "accountIdentifier": p44Config['tms_p44_api_config_carrier_customer_account_identifier'],
            },
            "carrierIdentifier": {
                "type": p44Config['tms_p44_api_config_carrier_identifier_type'],
                "value": p44Config['tms_p44_api_config_carrier_identifier_value']
            },
            "shipmentIdentifiers": [
                {
                    "type": "PRO",
                    "value": orderInfo['tms_order_pro'],
                    "primaryForType": true,
                    "source": "CUSTOMER"
                }
            ],
            "statusCode": status_code,
            "location": location,
            "stopType": stopType,
            "stopNumber": stopNumber,
            "deliveryAppointmentWindow": {
                "startDateTime": orderInfo['delivery_date'] + "T" + orderInfo['delivery_time'] + "+0000",
                "endDateTime": orderInfo['delivery_date'] + "T" + orderInfo['delivery_time_to'] + "+0000"

            },
            "sourceType": "API"
        };

    }


    async getLastSuccessTransferLine(order_id, api_name) {
        let sql = `select 
                tms_api_transfer_internal_status, tms_api_transfer_reference
                from tms_api_transfer
                where tms_api_transfer_status='${ApiStatus.SUCCESS}' and tms_api_transfer_api_name = '${api_name}'
                and fk_tms_order_id=${order_id}
                order by tms_api_transfer_create_when desc
                limit 1;
         `
        return await this.mysql.assocQuery(sql);
    }


    /*
    tms_order_log_system = 44  means log come from project44 3rd party api.
     */
    async  updateTmsOrderStatus(tms_api_transfer_id, order_id, pro, api_config_id) {
        let res = await this.getLastShipmentStatusByPro(pro);
        let update_sql = "";
        if (res.status < 0) {
            let request_str = this.mysql.escapeStr(JSON.stringify({ "url": P44Apis.get_project_44_ltl_tracking_url, "method": "GET", "pro": pro, "api_config_id":api_config_id}));
            let response_str = this.mysql.escapeStr(JSON.stringify({ "error": res }));

            update_sql = `update tms_api_transfer
                                 set tms_api_transfer_status='${ApiStatus.ERROR}',tms_api_transfer_update_when= now(),
                                    tms_api_transfer_request = ${request_str}, tms_api_transfer_response=${response_str}
                                 where tms_api_transfer_id = ${tms_api_transfer_id};
                                 `;

            await this.mysql.query(update_sql);
            return;
        } else if (res.status != 1 || !res.data || !res.data.statusReason) {
            let request_str = this.mysql.escapeStr(JSON.stringify({ "url": P44Apis.get_project_44_ltl_tracking_url, "method": "GET", "pro": pro }));
            let response_str = this.mysql.escapeStr(JSON.stringify({ "error": res }));

            update_sql = `update tms_api_transfer
                                 set tms_api_transfer_status='${ApiStatus.SUCCESS}',tms_api_transfer_update_when= now(),
                                    tms_api_transfer_request = ${request_str}, tms_api_transfer_response=${response_str}
                                 where tms_api_transfer_id = ${tms_api_transfer_id};
                                 `;

            await this.mysql.query(update_sql);
            return;
        }
        let lastStatus = res.data;
        let log_text = "Carrier Update: " + lastStatus.statusCode;
        let log_location = "NULL";
        if (lastStatus.address) {
            log_location = "'"+lastStatus.address.city + "," + lastStatus.address.state + "," + lastStatus.address.country+"'";
        }

        let log_text_escape = this.mysql.escapeStr(log_text);

        let log_datetime = this.moment().format('YYYY-MM-DD hh:mm:ss');

        if (lastStatus.retrievalDateTime) {
            log_datetime = this.moment(lastStatus.retrievalDateTime).format('YYYY-MM-DD hh:mm:ss');
        }
        let order_id_escape = this.mysql.escapeStr(order_id);

        let is_complete = lastStatus.statusCode == p44_config['DELIVERED'];

        if (lastStatus) {

            let tms_api_transfer_sql = `
                     select count(*) as num
                     from tms_api_transfer 
	                where tms_api_transfer.fk_tms_order_id = ${order_id_escape}
                    and tms_api_transfer_reference = ${log_text_escape}
                    and tms_api_transfer_status='${ApiStatus.SUCCESS}'
                    `;


            let raw = await this.mysql.assocQuery(tms_api_transfer_sql);
            let tms_api_transfer_status = ApiStatus.SKIP;
            if (parseInt(raw['num']) <= 0) {
                log_datetime = this.mysql.escapeStr(log_datetime);
                let tms_order = await this.mysql.assocQuery(`select tms_order.fk_company_id,fk_tms_order_group_id,tms_order_stage, tms_ap.fk_location_id as carrier, tms_ap.tms_ap_id,
                (select max(fk_tms_dispatch_id) from task_group where fk_tms_order_id = tms_order.tms_order_id and task_group.fk_company_id = tms_order.fk_company_id)
                as trip_num
                from tms_order 
                left join tms_ap on tms_ap.fk_tms_order_id = tms_order.tms_order_id
                where tms_order_id = ${order_id_escape};`);

                await this.mysql.query(`
                                      INSERT INTO tms_order_log 
                                       ( 
                                         fk_tms_order_id, fk_user_id, fk_company_id, tms_order_log_text,
                                         tms_order_log_created_date, fk_tms_order_group_id, tms_order_log_type, 
                                         tms_order_log_stage, tms_order_log_system,
                                         fk_tms_ap_id, fk_carrier_id,fk_dispatch_id,tms_order_log_location
                                       )
                                      VALUES(  
                                          ${order_id_escape},1, ${tms_order.fk_company_id}, ${log_text_escape},
                                          ${log_datetime}, ${tms_order.fk_tms_order_group_id}, 1,
                                           ${tms_order.tms_order_stage}, 44, ${tms_order.tms_ap_id},${tms_order.carrier},${tms_order.trip_num},
                                           ${log_location}
                                        );`
                );
                tms_api_transfer_status = ApiStatus.SUCCESS;

            }

            let external_reference = ` ,tms_api_transfer_reference = ${log_text_escape}`;
            let external_status = "";
            if (is_complete) {
                external_status = ` ,tms_api_transfer_external_status = '${ApiStatus.COMPLETE}' `;
            }

            update_sql = `update tms_api_transfer
                                 set tms_api_transfer_status='${tms_api_transfer_status}',tms_api_transfer_update_when= now()
                                     ${external_reference} ${external_status}
                                 where tms_api_transfer_id = ${tms_api_transfer_id};
                                 `;

            await this.mysql.query(update_sql);
        }

    }
}
module.exports = P44Service;