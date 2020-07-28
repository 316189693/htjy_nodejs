const nodemailer = require("nodemailer");
module.exports = {
    sendMail: async function (to, subject, text, html) {
        let transporter = nodemailer.createTransport({
            host: "mail.freightapp.com",
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: 'no-reply@freightapp.com', // generated ethereal user
                pass: 'b35fsm', // generated ethereal password
            },
            tls: {
                rejectUnauthorized: false
            }
        });
        let info = await transporter.sendMail({
            from: 'no-reply@freightapp.com', // sender address
            to: to, // list of receivers
            subject: subject, // Subject line
            text: text, // plain text body
            html: html
        });
    }
}

