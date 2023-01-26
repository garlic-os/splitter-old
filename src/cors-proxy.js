import corsProxy from "cors-anywhere";
import * as config from "../config.js";

export const server = corsProxy.createServer({
	originWhitelist: [
		`http://127.0.0.1:${config.webserverPort}`,
		`http://localhost:${config.webserverPort}`,
	],
});

server.listen(config.corsProxyPort, "127.0.0.1", () => {
	console.log(`CORS bypass proxy listening on port ${config.corsProxyPort}`);
});
