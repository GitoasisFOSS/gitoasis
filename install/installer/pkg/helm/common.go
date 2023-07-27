// Copyright (c) 2021 Gitpod GmbH. All rights reserved.
// Licensed under the GNU Affero General Public License (AGPL).
// See License.AGPL.txt in the project root for license information.

package helm

import (
	"fmt"
	"os"
	"strings"

	"github.com/gitpod-io/gitpod/installer/pkg/common"
)

// KeyValue ensure that a key/value pair is correctly formatted for Values
func KeyValue(key string, value string) string {
	return fmt.Sprintf("%s=%s", key, value)
}

// KeyValueArray ensure that a key/value pair is correctly formatted for Values
func KeyValueArray(key string, envs map[string]string) string {
	var envVarList []string
	for n, v := range envs {
		envVar := KeyValue(n, v)
		envVarList = append(envVarList, envVar)
	}
	return KeyValue(key, strings.Join(envVarList, ","))
}

// KeyFileValue ensure that a key/value pair is correctly formatted for FileValues
func KeyFileValue(key string, data []byte) (string, error) {
	dir, err := os.MkdirTemp("", "helm")
	if err != nil {
		return "", err
	}

	filePath := fmt.Sprintf("%s/file-value", dir)
	err = os.WriteFile(filePath, data, 0644)
	if err != nil {
		return "", err
	}

	return KeyValue(key, filePath), nil
}

type PkgConfig func(cfg *common.RenderContext) (*common.HelmConfig, error)
