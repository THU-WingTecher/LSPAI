npm run experiment -- --type opencode --task-list /LSPRAG/experiments/config/youtube-dl-robust-final.json --project-root /LSPRAG/experiments/projects/youtube-dl --model deepseek-chat --provider deepseek --parallel true --concurrency 20  --prompt-template cfg --output-name opencode-deepseek-youtube-dl-cfg

npm run experiment -- --type opencode --task-list /LSPRAG/experiments/config/youtube-dl-robust-final.json --project-root /LSPRAG/experiments/projects/youtube-dl --model deepseek-chat --provider deepseek --parallel true --concurrency 20 --output-name opencode-deepseek-youtube-dl

npm run experiment -- --type claudecode --task-list /LSPRAG/experiments/config/youtube-dl-robust-final.json --project-root /LSPRAG/experiments/projects/youtube-dl --model deepseek-chat --provider deepseek --parallel true --concurrency 20  --prompt-template cfg --output-name claudecode-deepseek-youtube-dl-cfg

npm run experiment -- --type claudecode --task-list /LSPRAG/experiments/config/youtube-dl-robust-final.json --project-root /LSPRAG/experiments/projects/youtube-dl --model deepseek-chat --provider deepseek --parallel true --concurrency 20 --output-name claudecode-deepseek-youtube-dl

##################### expRun3Config.json ######################
# [ 
#    {
#      "cachedDir": "/LSPRAG/claudecode-tests/deepseek-chat/claudecode-deepseek-youtube-dl-cfg/deepseek-chat/codes",
#      "testFileMapPath": "/LSPRAG/claudecode-tests/deepseek-chat/claudecode-deepseek-youtube-dl-cfg/test_file_map.json",
#      "promptType": "WITHCONTEXT",
#      "saveName": "claudecode_cfg_vars_deepseek"
#    },
#    {
#      "cachedDir": "/LSPRAG/claudecode-tests/deepseek-chat/claudecode-deepseek-youtube-dl/deepseek-chat/codes",
#      "testFileMapPath": "/LSPRAG/claudecode-tests/deepseek-chat/claudecode-deepseek-youtube-dl/test_file_map.json",
#      "promptType": "NAIVE",
#      "saveName": "claudecode_naive_deepseek"
#    },
#    {
#      "cachedDir": "/LSPRAG/opencode-tests/deepseek-chat/opencode-deepseek-youtube-dl-cfg/deepseek-chat/codes",
#      "testFileMapPath": "/LSPRAG/opencode-tests/deepseek-chat/opencode-deepseek-youtube-dl-cfg/test_file_map.json",
#      "promptType": "WITHCONTEXT",
#      "saveName": "opencode_cfg_vars_deepseek"
#    },
#    {
#      "cachedDir": "/LSPRAG/opencode-tests/deepseek-chat/opencode-deepseek-youtube-dl/deepseek-chat/codes",
#      "testFileMapPath": "/LSPRAG/opencode-tests/deepseek-chat/opencode-deepseek-youtube-dl/test_file_map.json",
#      "promptType": "NAIVE",
#      "saveName": "opencode_naive_deepseek"
#    }
#  ]
##################### expRun3Config.json ######################
xvfb-run -a npm run test \
        --testFile=exp.python.reflectRunner \
        --projectName=youtube-dl \
        --taskListPath=/LSPRAG/experiments/config/youtube-dl-robust-final.json \
        --parallelCount=40 \
        --model=deepseek-chat \
        --provider=deepseek \
        --testType=config --testConfigPath=/LSPRAG/expRun3Config.json