/**
 * Copyright (c) 2023 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License.AGPL.txt in the project root for license information.
 */

import { useEffect, useState } from "react";
import { getExperimentsClient } from "../experiments/client";

export const useOrbital = (spaceId: string) => {
    const [isLoaded, setIsLoaded] = useState<boolean>(false);
    const [discoveryIds, setDiscoveryIds] = useState<string[]>([]);

    useEffect(() => {
        if (document.getElementById("orbital-client")) return;
        const body = document.getElementsByTagName("body")[0];

        const installationScript = document.createElement("script");
        installationScript.innerHTML = `(function(o,r,b,i,t,a,l){o[r]||(t=o[r]=function(){i.push(arguments)},t._t=new Date,t._v=1,i=t._q=[])})(window,'orbital');`;
        body.appendChild(installationScript);

        const orbitalScript = document.createElement("script");
        orbitalScript.setAttribute("id", "orbital-client");
        orbitalScript.setAttribute("src", `https://client.useorbital.com/api/account/${spaceId}/client.js`);
        orbitalScript.setAttribute("async", "");
        body.appendChild(orbitalScript);
        orbitalScript.addEventListener("load", () => setIsLoaded(true), { once: true, capture: false });
    }, [spaceId]);

    useEffect(() => {
        const client = getExperimentsClient();

        (async () => {
            const featureFlagValue = await client.getValueAsync("enabledOrbitalDiscoveries", "", {
                gitpodHost: window.location.host,
            });
            setDiscoveryIds(featureFlagValue.split(",").filter((value) => !!value));
        })();

        return client.dispose;
    }, []);

    return {
        isLoaded,
        discoveryIds,
        //@ts-ignore
        orbital: window["orbital"] as unknown as any,
    };
};
