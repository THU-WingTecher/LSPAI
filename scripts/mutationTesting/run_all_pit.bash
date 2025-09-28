# before run this we should add 
#         <plugin>
#             <groupId>org.pitest</groupId>
#             <artifactId>pitest-maven</artifactId>
#             <version>1.15.0</version>
#             <dependencies>
#                 <dependency>
#                     <groupId>org.pitest</groupId>
#                     <artifactId>pitest-junit5-plugin</artifactId>
#                     <version>1.2.0</version>
#                 </dependency>
#             </dependencies>
#             <configuration>
#                 <verbose>true</verbose>
#                 <targetClasses>
#                     <param>org.apache.commons.csv.*</param>
#                 </targetClasses>
#                 <targetTests>
#                     <param>org.apache.commons.csv.*</param>
#                 </targetTests>
#             </configuration>
#         </plugin>
# to the pom.xml of commons-cli and commons-csv project

echo " &&&&&&&&&&&&&&& LSPRAG - ALL &&&&&&&&&&&&&& "
echo " ###### COMMONS-CSV ###### LSPRAG - deepseek-chat ######"
bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-csv \
    /LSPRAG/experiments/data/main_result/commons-csv/lsprag/1/deepseek-chat/results/final

# echo " ###### COMMONS-CSV ###### LSPRAG - gpt-4o ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-csv \
#     /LSPRAG/experiments/data/main_result/commons-csv/lsprag/1/gpt-4o/results/final

# echo " ###### COMMONS-CSV ###### LSPRAG - gpt-4o-mini ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-csv \
#     /LSPRAG/experiments/data/main_result/commons-csv/lsprag/1/gpt-4o-mini/results/final

# echo " &&&&&&&&&&&&&&& CODEQA - ALL &&&&&&&&&&&&&& "
# echo " ###### COMMONS-CSV ###### CODEQA - deepseek-chat ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-csv \
#     /LSPRAG/experiments/data/main_result/commons-csv/code_qa/codeQA_deepseek-chat_20250707_185801/codes

# echo " ###### COMMONS-CSV ###### CODEQA - gpt-4o ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-csv \
#     /LSPRAG/experiments/data/main_result/commons-csv/code_qa/codeQA_gpt-4o_20250707_184807/codes

# echo " ###### COMMONS-CSV ###### CODEQA - gpt-4o-mini ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-csv \
#     /LSPRAG/experiments/data/main_result/commons-csv/code_qa/codeQA_gpt-4o-mini_20250706_115311/codes

# echo " &&&&&&&&&&&&&&& STANDARDRAG - ALL &&&&&&&&&&&&&& "
# echo " ###### COMMONS-CSV ###### STANDARDRAG - deepseek-chat ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-csv \
#     /LSPRAG/experiments/data/main_result/commons-csv/standard/standardRag_deepseek-chat_20250706_145452/codes

# echo " ###### COMMONS-CSV ###### STANDARDRAG - gpt-4o ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-csv \
#     /LSPRAG/experiments/data/main_result/commons-csv/standard/standardRag_gpt-4o_20250706_150713/codes

# echo " ###### COMMONS-CSV ###### STANDARDRAG - gpt-4o-mini ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-csv \
#     /LSPRAG/experiments/data/main_result/commons-csv/standard/standardRag_gpt-4o-mini_20250706_150437/codes

# echo " &&&&&&&&&&&&&&& SYMPROMPT - ALL &&&&&&&&&&&&&& "
# echo " ###### COMMONS-CSV ###### SYMPROMPT - deepseek-chat ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-csv \
#     /LSPRAG/experiments/data/main_result/commons-csv/symprompt/1/deepseek-chat/results/final

echo " ###### COMMONS-CSV ###### SYMPROMPT - gpt-4o ######"
bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-csv \
    /LSPRAG/experiments/data/main_result/commons-csv/symprompt/3/symprompt_withcontext_nofix/gpt-4o/results/final

# echo " ###### COMMONS-CSV ###### SYMPROMPT - gpt-4o-mini ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-csv \
#     /LSPRAG/experiments/data/main_result/commons-csv/symprompt/1/gpt-4o-mini/results/final

# echo " &&&&&&&&&&&&&&& LSPRAG - ALL &&&&&&&&&&&&&& "
# echo " ###### COMMONS-CLI ###### LSPRAG - deepseek-chat ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-cli \
#     /LSPRAG/experiments/data/main_result/commons-cli/lsprag/1/deepseek-chat/results/final

# echo " ###### COMMONS-CLI ###### LSPRAG - gpt-4o ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-csv \
#     /LSPRAG/experiments/data/main_result/commons-csv/lsprag/1/gpt-4o/results/final

# echo " ###### COMMONS-CLI ###### LSPRAG - gpt-4o-mini ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-cli \
#     /LSPRAG/experiments/data/main_result/commons-cli/lsprag/1/gpt-4o-mini/results/final

# echo " &&&&&&&&&&&&&&& CODEQA - ALL &&&&&&&&&&&&&& "
# echo " ###### COMMONS-CLI ###### CODEQA - deepseek-chat ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-cli \
#     /LSPRAG/experiments/data/main_result/commons-cli/code_qa/codeQA_deepseek-chat_20250531_141954/codes

# echo " ###### COMMONS-CLI ###### CODEQA - gpt-4o ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-cli \
#     /LSPRAG/experiments/data/main_result/commons-cli/code_qa/codeQA_gpt-4o_20250531_142543/codes

# echo " ###### COMMONS-CLI ###### CODEQA - gpt-4o-mini ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-cli \
#     /LSPRAG/experiments/data/main_result/commons-cli/code_qa/codeQA_gpt-4o-mini_20250531_141630/codes

# echo " &&&&&&&&&&&&&&& STANDARDRAG - ALL &&&&&&&&&&&&&& "
# echo " ###### COMMONS-CLI ###### STANDARDRAG - deepseek-chat ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-cli \
#     /LSPRAG/experiments/data/main_result/commons-cli/standard/standardRag_deepseek-chat_20250601_160257/codes

# echo " ###### COMMONS-CLI ###### STANDARDRAG - gpt-4o ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-cli \
#     /LSPRAG/experiments/data/main_result/commons-cli/standard/standardRag_gpt-4o_20250601_160637/codes

# echo " ###### COMMONS-CLI ###### STANDARDRAG - gpt-4o-mini ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-cli \
#     /LSPRAG/experiments/data/main_result/commons-cli/standard/standardRag_gpt-4o-mini_20250601_160737/codes

# echo " &&&&&&&&&&&&&&& SYMPROMPT - ALL &&&&&&&&&&&&&& "
# echo " ###### COMMONS-CLI ###### SYMPROMPT - deepseek-chat ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-cli \
#     /LSPRAG/experiments/data/main_result/commons-cli/symprompt/1/deepseek-chat/results/final

# echo " ###### COMMONS-CLI ###### SYMPROMPT - gpt-4o ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-cli \
#     /LSPRAG/experiments/data/main_result/commons-cli/symprompt/1/gpt-4o/results/final

# echo " ###### COMMONS-CLI ###### SYMPROMPT - gpt-4o-mini ######"
# bash scripts/java_pit.bash /LSPRAG/experiments/projects/commons-cli \
#     /LSPRAG/experiments/data/main_result/commons-cli/symprompt/1/gpt-4o-mini/results/final