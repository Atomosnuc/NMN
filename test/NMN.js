const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
  return ethers.utils.parseUnits(n.toString(), 'ether')
}

const ether = tokens

describe('NMN', () => {
  let accounts, deployer
  let mirian, castar, tharni, pony, penny, brass, copper
  let tokenAddresses = Array()

  beforeEach(async () => {
    accounts = await ethers.getSigners()
    deployer = accounts[0]

    const Token = await ethers.getContractFactory('Token')
    
    mirian = await Token.deploy('Mirian','MRN','1000000')
    castar = await Token.deploy('Castar','CSTR','1000000')
    tharni = await Token.deploy('Tharni','TRN','1000000')
    pony = await Token.deploy('Silver Pony','PONY','1000000')
    penny = await Token.deploy('Silver Penny','PENNY','1000000')
    brass = await Token.deploy('Brass Coin','BRASS','1000000')
    copper = await Token.deploy('Copper Coin','COP','1000000')

    tokenAddresses = [
      mirian.address,
      castar.address,
      tharni.address,
      pony.address,
      penny.address,
      brass.address,
      copper.address
    ]

    const NMN = await ethers.getContractFactory('NMN')
    nmn = await NMN.deploy(tokenAddresses)
  })

  describe('Deployment', () => {
    
    it('has an address', async () => {
      expect(nmn.address).to.not.equal(0x0)
    })
    it('tracks address of all tokens', async () => {
      expect(await nmn.mirian()).to.equal(mirian.address)
      expect(await nmn.castar()).to.equal(castar.address)
      expect(await nmn.tharni()).to.equal(tharni.address)
      expect(await nmn.pony()).to.equal(pony.address)
      expect(await nmn.penny()).to.equal(penny.address)
      expect(await nmn.brass()).to.equal(brass.address)
      expect(await nmn.copper()).to.equal(copper.address)
    })

  })

})
