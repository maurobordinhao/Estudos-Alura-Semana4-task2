import { Request, Response } from 'express';
import { Paciente } from './pacienteEntity.js'
import { AppDataSource } from '../data-source.js'
import { Endereco } from '../enderecos/enderecoEntity.js'
import { CPFValido } from './validacaoCPF.js'
import { mapeiaPlano } from '../utils/planoSaudeUtils.js'
import { Consulta } from '../consultas/consultaEntity.js'
import { AppError, Status } from '../error/ErrorHandler.js'
import { encryptPassword } from '../utils/senhaUtils.js'
import { pacienteSchema } from './pacienteYupSchema.js';
import { sanitizacaoPaciente } from './pacienteSanitizations.js'
import { query, validationResult } from 'express-validator'

const suspiciousPatterns = /(=|<|>|--|;|\b(SELECT|INSERT|UPDATE|DELETE|DROP|SCRIPT)\b)/i;

export const consultaPorPaciente = [
  query('userInput')
    .isString().withMessage('O campo de busca deve ser um texto.')
    .trim()
    .isLength({ min: 2, max: 80 }).withMessage('A busca deve ter entre 2 e 80 caracteres.')
    .matches(/^[a-zA-ZÀ-ú\s'-]+$/).withMessage('O nome deve conter apenas letras, espaços e hífens.')
    .custom(value => {
      if (suspiciousPatterns.test(value)) {
        throw new Error('A entrada contém caracteres ou palavras não permitidas.');
      }
      return true;
    })
    .escape(),

  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { userInput } = req.query;
    const query = `SELECT * FROM paciente WHERE nome = ?`;

    try {
      const listaPacientes = await AppDataSource.manager.query(query, [userInput]);

      if (listaPacientes.length === 0) {
        res.status(404).json({ message: 'Paciente não encontrado!' });
      } else {
        const pacientesSanitizados = listaPacientes.map(({ senha, cpf, ...safe }) => safe);
        res.status(200).json(pacientesSanitizados);
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  }
]

export const criarPaciente = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const pacienteData = req.body

    const pacienteSanitizado: Paciente = sanitizacaoPaciente(pacienteData)
    await pacienteSchema.validate(pacienteSanitizado);

    let {
      cpf,
      nome,
      email,
      senha,
      estaAtivo,
      possuiPlanoSaude,
      endereco,
      telefone,
      planosSaude,
      imagemUrl,
      imagem,
      historico
    } = pacienteSanitizado

    if (!CPFValido(cpf)) {
      throw new AppError('CPF Inválido!')
    }

    const existePacienteComCPF = await AppDataSource.getRepository(Paciente).findOne({
      where: { cpf }
    })
    if (existePacienteComCPF != null) {
      res.status(409).json({ message: 'Já existe um paciente com esse CPF!' })
    }

    if (possuiPlanoSaude === true && planosSaude !== undefined) {
      planosSaude = mapeiaPlano(planosSaude)
    }

    const senhaCriptografada = encryptPassword(senha)
    const paciente = new Paciente(
      cpf,
      nome,
      email,
      senhaCriptografada,
      telefone,
      planosSaude,
      estaAtivo,
      imagemUrl,
      imagem,
      historico
    )
    paciente.possuiPlanoSaude = possuiPlanoSaude
    const enderecoPaciente = new Endereco()

    if (endereco !== undefined) {
      enderecoPaciente.cep = endereco.cep
      enderecoPaciente.rua = endereco.rua
      enderecoPaciente.estado = endereco.estado
      enderecoPaciente.numero = endereco.numero
      enderecoPaciente.complemento = endereco.complemento

      paciente.endereco = enderecoPaciente

      await AppDataSource.manager.save(Endereco, enderecoPaciente)
    }

    await AppDataSource.manager.save(Paciente, paciente)

    const {senha: _senha, cpf: _cpf, ...pacienteSemDadosSensiveis} = paciente

    res.status(202).json(pacienteSemDadosSensiveis)
  } catch (error) {
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message })
    } else {
      res.status(502).json({ 'Paciente não foi criado': error })
      console.log(error)
    }
  }
}

export const exibeTodosPacientes = async (
  req: Request,
  res: Response
): Promise<void> => {
  const tabelaPaciente = AppDataSource.getRepository(Paciente)
  const allPacientes = await tabelaPaciente.find({ relations: ['imagem'] })
  if (allPacientes.length === 0) {
    res.status(200).json([])
  } else {
    res.status(200).json(allPacientes)
  }
}

export const lerPaciente = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params
  const paciente = await AppDataSource.manager.findOne(Paciente, {
    where: { id },
    relations: {
      endereco: true,
      imagem: true
    }
  })

  if (paciente === null) {
    res.status(404).json('Paciente não encontrado!')
  } else {
    res.status(200).json(paciente)
  }
}

export const listaConsultasPaciente = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params
  const paciente = await AppDataSource.manager.findOne(Paciente, {
    where: { id }
  })
  if (paciente == null) {
    throw new AppError('Paciente não encontrado!', Status.NOT_FOUND)
  }
  const consultas = await AppDataSource.manager.find(Consulta, {
    where: { paciente: { id: paciente.id } }
  })

  const consultadasTratadas = consultas.map((consulta) => {
    return {
      id: consulta.id,
      data: consulta.data,
      desejaLembrete: consulta.desejaLembrete,
      lembretes: consulta.lembretes,
      especialista: consulta.especialista
    }
  })

  return res.json(consultadasTratadas)
}

export const atualizarPaciente = async (
  req: Request,
  res: Response
): Promise<void> => {
  let {
    nome,
    email,
    senha,
    estaAtivo,
    telefone,
    possuiPlanoSaude,
    planosSaude,
    cpf,
    imagemUrl,
    imagem,
    historico
  } = req.body

  const { id } = req.params

  if (!CPFValido(cpf)) {
    throw new AppError('CPF Inválido!', Status.BAD_REQUEST)
  }

  if (possuiPlanoSaude === true && planosSaude !== undefined) {
    planosSaude = mapeiaPlano(planosSaude)
  }

  try {
    const paciente = await AppDataSource.manager.findOne(Paciente, {
      where: { id },
      relations: ['endereco']
    })

    if (paciente === null) {
      res.status(404).json('Paciente não encontrado!')
    } else {
      paciente.cpf = cpf
      paciente.nome = nome
      paciente.email = email
      paciente.possuiPlanoSaude = possuiPlanoSaude
      paciente.telefone = telefone
      paciente.planosSaude = planosSaude
      paciente.estaAtivo = estaAtivo
      paciente.imagemUrl = imagemUrl
      paciente.imagem = imagem
      paciente.historico = historico

      await AppDataSource.manager.save(Paciente, paciente)
      res.status(200).json(paciente)
    }
  } catch (error) {
    res.status(502).json('Paciente não foi atualizado!')
  }
}

export const atualizarEnderecoPaciente = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params
  const { cep, rua, numero, estado, complemento } = req.body
  const paciente = await AppDataSource.manager.findOne(Paciente, {
    where: { id },
    relations: ['endereco']
  })

  if (paciente === null) {
    res.status(404).json('Paciente não encontrado!')
  } else {
    if (paciente.endereco === null) {
      const endereco = new Endereco()
      endereco.cep = cep
      endereco.rua = rua
      endereco.estado = estado
      endereco.numero = numero
      endereco.complemento = complemento

      paciente.endereco = endereco

      await AppDataSource.manager.save(Endereco, endereco)
    } else {
      paciente.endereco.cep = cep
      paciente.endereco.rua = rua
      paciente.endereco.estado = estado
      paciente.endereco.numero = numero
      paciente.endereco.complemento = complemento
    }

    await AppDataSource.manager.save(Paciente, paciente)

    res.status(200).json(paciente)
  }
}

export const desativaPaciente = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params
  const paciente = await AppDataSource.manager.findOne(Paciente, {
    where: { id }
  })

  if (paciente === null) {
    res.status(404).json('Paciente não encontrado!')
  } else {
    paciente.estaAtivo = false
    await AppDataSource.manager.delete(Paciente, { id: paciente.id })
    res.json({
      message: 'Paciente desativado!'
    })
  }
}

