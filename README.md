# Estudos-Alura-Semana4-task2

1 - Foi adicionada validação com express-validator na function: consultaPorPaciente.

O campo userInput exige receber uma uma string e ter no mínimo 2 e no máximo 80 caracteres

Foi realizado sanitização e remoção de espaços extras e caracteres suspeitos.

2 - Lógica de tratamento de erros:

Quando a entrada é inválida, o endpoint deve retornar status 400 com mensagens de texto.

Proteção contra SQL Injection, validação e filtro do input para impedir que ele não contenha padrões suspeitos como ==, <script>, etc.

O arquivo: pacienteController.ts foi adicionado com as alterações sugeridas.

Foi feito teste usando o insomnia, usando como entrada: números, caracteres especiais, espaços fora do padrão, etc

Essas tentativas foram neutralizadas e receberam uma mensagem de texto.

Alguns prints do insomnia foram adicionados à raiz desse projeto.
