import { useSelector, useDispatch } from 'react-redux'
import Navbar from 'react-bootstrap/Navbar';
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import Blockies from 'react-blockies'

import Table from 'react-bootstrap/Table'

import logo from '../GandalfOnDeV.png';

const Navigation = ({ account }) => {
  return (
    <Navbar className='my-3'>
      <img
        alt="logo"
        src={logo}
        width="100"
        height="100"
        className="d-inline-block align-top mx-3"
      />
      <Navbar.Brand href="#">
        <div className="lane-container">
          <p className="m-0 text-center">Gandalf</p>
          <p className="m-0 text-center">on</p>
          <p className="m-0 text-center">Dev</p>
        </div>
      </Navbar.Brand>
      <Navbar.Toggle aria-controls="nav" />
      <Navbar.Collapse className="justify-content-end">
        <Navbar.Text>
          {account}
        </Navbar.Text>
      </Navbar.Collapse>
    </Navbar>
  );
}

export default Navigation;
