start_time=$(date +%s)
echo $start_time
curl "https://api.openai.com/v1/organization/costs?start_time={$start_time}&limit=1" \
-H "Authorization: Bearer $OPENAI_ADMIN_KEY" \
-H "Content-Type: application/json" \
-H "project_ids: $project_ids"