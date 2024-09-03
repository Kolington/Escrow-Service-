import { createApp } from "@deroll/app";
import { createWallet } from "@deroll/wallet";
import { hexToString, stringToHex } from "viem";

const app = createApp({ url: process.env.ROLLUP_HTTP_SERVER_URL || "http://127.0.0.1:5004" });
const wallet = createWallet();

app.addAdvanceHandler(wallet.handler);

let escrows = {};

app.addAdvanceHandler(async ({ metadata, payload }) => {
    const sender = metadata.msg_sender;
    const payloadString = hexToString(payload);
    console.log("Sender:", sender, "Payload:", payloadString);

    try {
        const jsonPayload = JSON.parse(payloadString);
        if (jsonPayload.method === "create_escrow") {
            const { escrowId, amount } = jsonPayload;
            escrows[escrowId] = { amount, buyer: sender, funded: false };
            console.log(`Escrow created: ${escrowId} - Amount: ${amount}`);
        } else if (jsonPayload.method === "fund_escrow") {
            const { escrowId } = jsonPayload;
            if (escrows[escrowId] && !escrows[escrowId].funded) {
                const amount = escrows[escrowId].amount;
                const voucher = wallet.withdrawEther(sender, amount);
                await app.createVoucher(voucher);
                escrows[escrowId].funded = true;
                console.log(`Escrow funded: ${escrowId}`);
            }
        } else if (jsonPayload.method === "release_funds") {
            const { escrowId } = jsonPayload;
            if (escrows[escrowId] && escrows[escrowId].funded) {
                const amount = escrows[escrowId].amount;
                const voucher = wallet.withdrawEther(sender, amount);
                await app.createVoucher(voucher);
                delete escrows[escrowId];
                console.log(`Funds released for escrow: ${escrowId}`);
            }
        }
        return "accept";
    } catch (e) {
        console.error(e);
        app.createReport({ payload: stringToHex(String(e)) });
        return "reject";
    }
});

app.addInspectHandler(async ({ payload }) => {
    const url = hexToString(payload).split("/"); // e.g., "rollup/escrow/123"
    console.log("Inspect call:", url);

    if (url[1] === "escrow") {
        const escrowId = url[2];
        const escrow = escrows[escrowId] || "Escrow not found";
        await app.createReport({ payload: stringToHex(JSON.stringify(escrow)) });
    } else {
        console.log("Invalid inspect call");
        await app.createReport({ payload: stringToHex("Invalid inspect call") });
    }
});

app.start().catch((e) => {
    console.error(e);
    process.exit(1);
});
