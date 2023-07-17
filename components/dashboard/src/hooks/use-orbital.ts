/**
 * Copyright (c) 2023 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License.AGPL.txt in the project root for license information.
 */

import { useEffect, useState } from "react";

export const useOrbital = (spaceId: string) => {
    const [isLoaded, setIsLoaded] = useState<boolean>(false);

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
    });

    return {
        isLoaded,
        //@ts-ignore
        orbital: window["orbital"] as unknown as any,
    };
};
